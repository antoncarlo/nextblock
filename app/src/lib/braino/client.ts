/**
 * Braino.ai / WAVENURE client — SERVER-ONLY.
 *
 * Implements the NextBlock side of contracts/docs/integrations/braino-oracle-spec.md:
 *   - transport (§2): every response must carry X-Braino-Signature =
 *     hex(hmac_sha256(shared_secret, raw_body)); verified over the RAW bytes,
 *     before anything is parsed;
 *   - the common response envelope (§2) and the evidence protocol (§5):
 *     sourceHash = keccak256(canonical_json(report));
 *   - S1 NAV, S2 portfolio risk, S3 claim assessment.
 *
 * Everything is fail-closed. A response that is unsigned, mis-signed, malformed,
 * outside its numeric bounds, or that omits a required criterion is rejected and
 * nothing is published. The result of any call is ADVISORY: it feeds an on-chain
 * store (NavOracle / AIAssessor) that has no authority to approve or pay.
 *
 * Request-side authentication is not defined by the spec; an optional bearer key
 * (BRAINO_API_KEY) is sent when set. Confirm it during vendor onboarding.
 *
 * Pure module apart from `fetch`: no chain access, no framework imports, so it runs
 * under the strip-types smoke loader. Money is carried as decimal strings and
 * converted with integer arithmetic only — never through a float.
 */

import type { Hex } from 'viem';
import {
  canonicalJson,
  sourceHash,
  validateNavReport,
  verifyBrainoSignature,
  type CanonicalValue,
  type NavReport,
  type PublishNavArgs,
} from '../oracle-node.ts';

export type BrainoErrorCode =
  | 'not_configured'
  | 'network'
  | 'timeout'
  | 'http'
  | 'signature'
  | 'envelope'
  | 'result'
  | 'context';

export class BrainoError extends Error {
  readonly code: BrainoErrorCode;
  constructor(code: BrainoErrorCode, message: string) {
    super(message);
    this.name = 'BrainoError';
    this.code = code;
  }
}

// ─── Configuration ───────────────────────────────────────────────────────────
export interface BrainoConfig {
  baseUrl: string;
  hmacSecret: string;
  /** Optional bearer credential for the request side (not defined by the spec). */
  apiKey: string | null;
}

export type BrainoConfigResult =
  | { ok: true; config: BrainoConfig }
  | { ok: false; problems: string[] };

function isLocalHttp(url: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(url);
}

/** BRAINO_BASE_URL (https), BRAINO_HMAC_SECRET, optional BRAINO_API_KEY. */
export function brainoConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): BrainoConfigResult {
  const problems: string[] = [];
  const baseUrl = (env.BRAINO_BASE_URL ?? '').trim();
  const hmacSecret = env.BRAINO_HMAC_SECRET ?? '';
  const apiKey = (env.BRAINO_API_KEY ?? '').trim();

  if (!baseUrl) problems.push('BRAINO_BASE_URL is not set');
  else if (!/^https:\/\//.test(baseUrl) && !isLocalHttp(baseUrl)) {
    problems.push('BRAINO_BASE_URL must be an https URL');
  }
  if (!hmacSecret) problems.push('BRAINO_HMAC_SECRET is not set');

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, config: { baseUrl, hmacSecret, apiKey: apiKey || null } };
}

// ─── Decimal <-> integer units (6 dp) ────────────────────────────────────────
/** "1234567.123456" -> 1234567123456n. Rejects negatives, exponents, >6 decimals. */
export function parseDecimalToUnits(value: unknown, decimals = 6): bigint | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return null;
  const frac = m[2] ?? '';
  if (frac.length > decimals) return null;
  return BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}

/** 1234567123456n -> "1234567.123456". */
export function unitsToDecimal(units: bigint, decimals = 6): string {
  if (units < 0n) throw new Error('unitsToDecimal: negative amount');
  const base = 10n ** BigInt(decimals);
  return `${units / base}.${(units % base).toString().padStart(decimals, '0')}`;
}

// ─── Transport + envelope ────────────────────────────────────────────────────
export interface BrainoEnvelope {
  reportId: string;
  modelVersion: string;
  asOf: string;
  confidence: number;
  result: Record<string, unknown>;
  report: CanonicalValue;
  /** The exact bytes received — the audit artifact, persist verbatim. */
  rawBody: string;
}

export interface BrainoCallOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Validate the common response envelope (spec §2). Throws BrainoError('envelope'). */
export function parseEnvelope(rawBody: string): BrainoEnvelope {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new BrainoError('envelope', 'response body is not JSON');
  }
  if (!isPlainObject(json)) throw new BrainoError('envelope', 'response is not an object');

  const { reportId, modelVersion, asOf, confidence, result, report } = json;
  if (!nonEmptyString(reportId)) throw new BrainoError('envelope', 'reportId missing');
  if (!nonEmptyString(modelVersion)) throw new BrainoError('envelope', 'modelVersion missing');
  if (!nonEmptyString(asOf) || !Number.isFinite(Date.parse(asOf))) {
    throw new BrainoError('envelope', 'asOf is not a timestamp');
  }
  if (typeof confidence !== 'number' || !(confidence >= 0 && confidence <= 1)) {
    throw new BrainoError('envelope', 'confidence must be within [0,1]');
  }
  if (!isPlainObject(result)) throw new BrainoError('envelope', 'result missing');
  if (!isPlainObject(report)) throw new BrainoError('envelope', 'report missing');
  try {
    canonicalJson(report as CanonicalValue);
  } catch {
    throw new BrainoError('envelope', 'report cannot be canonicalised');
  }
  return {
    reportId,
    modelVersion,
    asOf,
    confidence,
    result,
    report: report as CanonicalValue,
    rawBody,
  };
}

/**
 * POST a JSON body to a Braino endpoint and return the verified envelope.
 * The signature is checked over the raw bytes BEFORE the body is parsed.
 */
export async function brainoPost(
  config: BrainoConfig,
  path: string,
  body: unknown,
  opts: BrainoCallOptions = {},
): Promise<BrainoEnvelope> {
  const f = opts.fetchImpl ?? fetch;
  const url = `${config.baseUrl.replace(/\/+$/, '')}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);

  let status: number;
  let ok: boolean;
  let signature: string | null;
  let raw: string;
  try {
    const res = await f(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    status = res.status;
    ok = res.ok;
    signature = res.headers.get('x-braino-signature');
    raw = await res.text();
  } catch (err) {
    if (controller.signal.aborted) throw new BrainoError('timeout', `no response from ${path}`);
    throw new BrainoError('network', `request to ${path} failed (${err instanceof Error ? err.name : 'error'})`);
  } finally {
    clearTimeout(timer);
  }

  // Status only: a failing vendor's body is never echoed into logs or errors.
  if (!ok) throw new BrainoError('http', `${path} answered HTTP ${status}`);
  if (!verifyBrainoSignature(raw, signature, config.hmacSecret)) {
    throw new BrainoError('signature', `${path}: X-Braino-Signature missing or invalid`);
  }
  return parseEnvelope(raw);
}

// ─── S3 — claim assessment ───────────────────────────────────────────────────
export const CLAIM_CRITERIA = ['coverage', 'evidence', 'quantification', 'fraud', 'terms'] as const;
export type BrainoRecommendation = 'APPROVE' | 'REVIEW' | 'REJECT';
const RECOMMENDATIONS: readonly string[] = ['APPROVE', 'REVIEW', 'REJECT'];

export interface ClaimAssessmentRequest {
  claimId: string;
  portfolioId: string;
  /** Decimal USDC strings (6 dp). */
  requestedAmount: string;
  coverageLimit: string;
  policyTerms: Record<string, CanonicalValue>;
  evidence: Array<{ contentHash: string; url?: string; contentType: string }>;
  description: string;
}

export interface BrainoClaimAssessment {
  scoreBps: number;
  anomalyScoreBps: number;
  confidenceBps: number;
  recommendation: BrainoRecommendation;
  /** USDC base units (6 dp). */
  recommendedAmount: bigint;
  criteria: Record<(typeof CLAIM_CRITERIA)[number], string>;
  reportId: string;
  modelVersion: string;
  asOf: string;
  /** keccak256(canonical_json(report)) — anchored on-chain with the value. */
  sourceHash: Hex;
  rawBody: string;
}

function unitInterval(v: unknown, name: string): number {
  if (typeof v !== 'number' || !(v >= 0 && v <= 1)) {
    throw new BrainoError('result', `${name} must be a number within [0,1]`);
  }
  return Math.round(v * 10_000);
}

/** Validate an S3 envelope against the request it answers. Throws BrainoError('result'). */
export function parseClaimAssessment(
  env: BrainoEnvelope,
  requestedAmount: bigint,
): BrainoClaimAssessment {
  const r = env.result;
  const scoreBps = unitInterval(r.score, 'score');
  const anomalyScoreBps = unitInterval(r.anomaly, 'anomaly');

  if (typeof r.recommendation !== 'string' || !RECOMMENDATIONS.includes(r.recommendation)) {
    throw new BrainoError('result', 'recommendation must be APPROVE, REVIEW or REJECT');
  }
  const recommendedAmount = parseDecimalToUnits(r.recommendedAmount);
  if (recommendedAmount === null) {
    throw new BrainoError('result', 'recommendedAmount must be a decimal string with at most 6 decimals');
  }
  // An advisory figure above what the cedant asked for is not a recommendation.
  if (recommendedAmount > requestedAmount) {
    throw new BrainoError('result', 'recommendedAmount exceeds the requested amount');
  }

  // Spec §3 S3: the five criteria are evaluated explicitly and separately.
  if (!isPlainObject(r.criteria)) throw new BrainoError('result', 'criteria missing');
  const criteria = {} as Record<(typeof CLAIM_CRITERIA)[number], string>;
  for (const key of CLAIM_CRITERIA) {
    const v = r.criteria[key];
    if (!nonEmptyString(v)) throw new BrainoError('result', `criterion "${key}" missing`);
    criteria[key] = v;
  }

  return {
    scoreBps,
    anomalyScoreBps,
    confidenceBps: Math.round(env.confidence * 10_000),
    recommendation: r.recommendation as BrainoRecommendation,
    recommendedAmount,
    criteria,
    reportId: env.reportId,
    modelVersion: env.modelVersion,
    asOf: env.asOf,
    sourceHash: sourceHash(env.report),
    rawBody: env.rawBody,
  };
}

export async function assessClaim(
  config: BrainoConfig,
  request: ClaimAssessmentRequest,
  requestedAmount: bigint,
  opts: BrainoCallOptions = {},
): Promise<BrainoClaimAssessment> {
  // Spec §7: claim assessment answers within 60 s.
  const env = await brainoPost(config, '/v1/assess', request, { timeoutMs: 70_000, ...opts });
  return parseClaimAssessment(env, requestedAmount);
}

// ─── S2 — portfolio risk ─────────────────────────────────────────────────────
export interface PortfolioRiskRequest {
  portfolioId: string;
  /** On-chain keccak256 of the bordereau; the report MUST reference it. */
  documentHash: string;
  bordereauSummary: Record<string, CanonicalValue>;
  treatyTerms: Record<string, CanonicalValue>;
  lossHistory?: CanonicalValue;
}

export interface BrainoPortfolioRisk {
  expectedLossBps: number;
  recommendedPricingBps: number;
  /** USDC base units (6 dp). */
  maxRecommendedCapacity: bigint;
  exclusions: string[];
  riskFactors: Array<{ name: string; weightBps: number; note: string }>;
  confidenceBps: number;
  reportId: string;
  modelVersion: string;
  asOf: string;
  sourceHash: Hex;
  rawBody: string;
}

function bpsInt(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 10_000) {
    throw new BrainoError('result', `${name} must be an integer within [0,10000]`);
  }
  return v;
}

export function parsePortfolioRisk(env: BrainoEnvelope, documentHash: string): BrainoPortfolioRisk {
  const r = env.result;
  const expectedLossBps = bpsInt(r.expectedLossBps, 'expectedLossBps');
  const recommendedPricingBps = bpsInt(r.recommendedPricingBps, 'recommendedPricingBps');
  const maxRecommendedCapacity = parseDecimalToUnits(r.maxRecommendedCapacity);
  if (maxRecommendedCapacity === null) {
    throw new BrainoError('result', 'maxRecommendedCapacity must be a decimal string with at most 6 decimals');
  }
  if (!Array.isArray(r.exclusions) || !r.exclusions.every((x) => typeof x === 'string')) {
    throw new BrainoError('result', 'exclusions must be a list of strings');
  }
  if (!Array.isArray(r.riskFactors)) throw new BrainoError('result', 'riskFactors must be a list');
  const riskFactors = r.riskFactors.map((f: unknown) => {
    if (!isPlainObject(f) || !nonEmptyString(f.name) || typeof f.note !== 'string') {
      throw new BrainoError('result', 'riskFactors entry is malformed');
    }
    return { name: f.name, weightBps: bpsInt(f.weightBps, 'riskFactors.weightBps'), note: f.note };
  });
  // Spec §3 S2: the report MUST reference the on-chain document hash.
  if (!canonicalJson(env.report).toLowerCase().includes(documentHash.toLowerCase())) {
    throw new BrainoError('result', 'report does not reference the portfolio documentHash');
  }
  return {
    expectedLossBps,
    recommendedPricingBps,
    maxRecommendedCapacity,
    exclusions: r.exclusions as string[],
    riskFactors,
    confidenceBps: Math.round(env.confidence * 10_000),
    reportId: env.reportId,
    modelVersion: env.modelVersion,
    asOf: env.asOf,
    sourceHash: sourceHash(env.report),
    rawBody: env.rawBody,
  };
}

export async function assessPortfolioRisk(
  config: BrainoConfig,
  request: PortfolioRiskRequest,
  opts: BrainoCallOptions = {},
): Promise<BrainoPortfolioRisk> {
  const env = await brainoPost(config, '/v1/risk', request, { timeoutMs: 15_000, ...opts });
  return parsePortfolioRisk(env, request.documentHash);
}

// ─── S1 — vault NAV ──────────────────────────────────────────────────────────
export interface NavRequest {
  chainId: number;
  vaultAddress: string;
  /** The Lens vault dashboard, bigints already rendered as decimal strings. */
  snapshot: Record<string, CanonicalValue>;
}

export interface BrainoNav {
  args: PublishNavArgs;
  reportId: string;
  modelVersion: string;
  asOf: string;
  rawBody: string;
}

/**
 * Turn a verified S1 envelope into the publishNav arguments.
 *
 * validateNavReport enforces the node-side pre-flight (address, positive NAV,
 * confidence, report age). Its own hash covers the flattened object it is given;
 * spec §5 says the on-chain hash must be keccak256(canonical_json(report)) of the
 * vendor's report, so the hash is replaced with exactly that.
 */
export function parseNav(
  env: BrainoEnvelope,
  vaultAddress: string,
  nowSeconds: number,
): BrainoNav {
  const r = env.result;
  if (r.currency !== 'USDC') throw new BrainoError('result', 'currency must be USDC');
  const nav = parseDecimalToUnits(r.nav);
  if (nav === null) throw new BrainoError('result', 'nav must be a decimal string with at most 6 decimals');

  const report: NavReport = {
    vault: vaultAddress,
    nav: nav.toString(),
    confidence: env.confidence,
    reportId: env.reportId,
    modelVersion: env.modelVersion,
    generatedAt: Math.floor(Date.parse(env.asOf) / 1000),
  };
  const validated = validateNavReport(report, nowSeconds);
  if (!validated.ok) throw new BrainoError('result', validated.errors.join('; '));

  return {
    args: { ...validated.args, sourceHash: sourceHash(env.report) },
    reportId: env.reportId,
    modelVersion: env.modelVersion,
    asOf: env.asOf,
    rawBody: env.rawBody,
  };
}

export async function fetchNav(
  config: BrainoConfig,
  request: NavRequest,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  opts: BrainoCallOptions = {},
): Promise<BrainoNav> {
  const env = await brainoPost(config, '/v1/nav', request, { timeoutMs: 15_000, ...opts });
  return parseNav(env, request.vaultAddress, nowSeconds);
}

// ─── Publish decision (pure) ─────────────────────────────────────────────────
export const NAV_HEARTBEAT_SECONDS = 6 * 3600;

export type NavDecision =
  | { action: 'publish'; reason: 'first' | 'changed' | 'heartbeat' }
  | { action: 'skip'; reason: 'unchanged' }
  | { action: 'withhold'; reason: 'feed_paused' | 'deviation'; deviationBps?: number };

/**
 * Decide whether to send a NAV, mirroring the on-chain guards so the keeper never
 * trips them unattended. A deviation beyond the guard is WITHHELD, not sent: on-chain
 * it would pause the feed, and the way through is a Sentinel review
 * (acknowledgeDeviation) followed by the next run.
 */
export function decideNavPublish(args: {
  newNav: bigint;
  lastNav: bigint | null;
  lastUpdatedAt: number | null;
  feedPaused: boolean;
  deviationWaiver: boolean;
  maxDeviationBps: bigint;
  nowSeconds: number;
  heartbeatSeconds?: number;
}): NavDecision {
  if (args.feedPaused) return { action: 'withhold', reason: 'feed_paused' };
  if (args.lastNav === null || args.lastUpdatedAt === null || args.lastNav === 0n) {
    return { action: 'publish', reason: 'first' };
  }
  if (!args.deviationWaiver) {
    const diff = args.newNav > args.lastNav ? args.newNav - args.lastNav : args.lastNav - args.newNav;
    const deviationBps = (diff * 10_000n) / args.lastNav;
    if (deviationBps > args.maxDeviationBps) {
      return { action: 'withhold', reason: 'deviation', deviationBps: Number(deviationBps) };
    }
  }
  if (args.newNav !== args.lastNav) return { action: 'publish', reason: 'changed' };
  const heartbeat = args.heartbeatSeconds ?? NAV_HEARTBEAT_SECONDS;
  if (args.nowSeconds - args.lastUpdatedAt >= heartbeat) return { action: 'publish', reason: 'heartbeat' };
  return { action: 'skip', reason: 'unchanged' };
}
