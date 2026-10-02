import { keccak256, toHex } from 'viem';
import {
  assessClaim,
  brainoConfigFromEnv,
  BrainoError,
  unitsToDecimal,
  type BrainoConfig,
  type ClaimAssessmentRequest,
} from '../braino/client.ts';
import type { CanonicalValue } from '../oracle-node.ts';

/**
 * AI claim assessor — pluggable provider (Pilot Readiness gap #5).
 *
 *   - `BrainoAIAssessor` — the real Braino.ai/WAVENURE client (S3 of the integration
 *      spec): HMAC-verified, fail-closed, sourceHash = keccak256(canonical report).
 *   - `MockAIAssessor` — deterministic scoring for CI and local development only,
 *      derived from claim id + requested amount + an optional magic substring in
 *      the description (e.g. `__ANOMALY__` flips anomaly score to 9000). It is
 *      REFUSED on production (see getAIAssessorProvider): a mock must never put a
 *      draft in front of the reviewer who publishes on-chain.
 *
 * Provider selection: `AI_ASSESSOR_PROVIDER=mock|braino` (default mock outside production).
 *
 * Pure + framework-free — runs under the strip-types smoke loader.
 */

import type { Recommendation } from './recommendation.ts';
export {
  CONTRACT_RECOMMENDATION,
  toContractRecommendation,
  type Recommendation,
} from './recommendation.ts';

/** Everything about a claim that the vendor needs and the chain already knows. */
export interface ClaimContext {
  portfolioId: bigint;
  vault: string;
  claimType: 'NON_PARAMETRIC' | 'PARAMETRIC';
  /** On-chain anchor of the evidence bundle. */
  evidenceHash: string;
  submittedAt: number;
  /** USDC base units. */
  coverageLimit: bigint;
  policyTerms: Record<string, CanonicalValue>;
  /** Documents, when a short-lived signed URL can be minted for them. */
  evidence?: Array<{ contentHash: string; url: string; contentType: string }>;
}

export interface ClaimAssessmentInput {
  claimId: bigint;
  /** Requested payout in USDC base units (6 decimals). */
  requestedAmount: bigint;
  /** Free-text payload the cedant attached (description / metadata blob). */
  description?: string;
  /** On-chain facts about the claim; required by the Braino provider. */
  context?: ClaimContext;
}

export interface AssessmentDraft {
  claimId: bigint;
  scoreBps: number;
  anomalyScoreBps: number;
  confidenceBps: number;
  recommendation: Recommendation;
  /** USDC base units. */
  recommendedAmount: bigint;
  /** keccak256 of canonical(claimId | requestedAmount | description | provider). */
  sourceHash: `0x${string}`;
  provider: 'mock' | 'braino';
  raw: Record<string, unknown>;
}

export interface AIAssessorProvider {
  readonly name: 'mock' | 'braino';
  assess(input: ClaimAssessmentInput): Promise<AssessmentDraft>;
}

/**
 * Build the canonical bytes that get keccak256'd into the sourceHash.
 * Deterministic for the same input regardless of provider runtime jitter,
 * so re-running the assessor yields the same hash if the inputs match.
 */
export function canonicalAssessmentBytes(args: {
  claimId: bigint;
  requestedAmount: bigint;
  description: string;
  provider: string;
}): Uint8Array {
  const s = JSON.stringify({
    c: args.claimId.toString(),
    r: args.requestedAmount.toString(),
    d: args.description,
    p: args.provider,
  });
  return new TextEncoder().encode(s);
}

function sourceHashOf(args: {
  claimId: bigint;
  requestedAmount: bigint;
  description: string;
  provider: string;
}): `0x${string}` {
  return keccak256(toHex(canonicalAssessmentBytes(args)));
}

/**
 * Deterministic mock. Score is high when description is "normal", anomaly
 * spikes on magic substrings, confidence is fixed at 0.7. Recommendation:
 *  - REJECT (2) when anomaly > 0.6
 *  - REVIEW (1) when 0.3 < anomaly <= 0.6 OR score < 0.5
 *  - APPROVE (0) otherwise
 */
export class MockAIAssessor implements AIAssessorProvider {
  readonly name = 'mock' as const;

  async assess(input: ClaimAssessmentInput): Promise<AssessmentDraft> {
    const desc = (input.description ?? '').toUpperCase();
    let scoreBps = 7500;
    let anomalyScoreBps = 1000;
    if (desc.includes('__ANOMALY__')) anomalyScoreBps = 9000;
    if (desc.includes('__REJECT__')) {
      scoreBps = 2000;
      anomalyScoreBps = 9500;
    }
    if (desc.includes('__REVIEW__')) {
      scoreBps = 5500;
      anomalyScoreBps = 4500;
    }
    const confidenceBps = 7000;

    const recommendation: Recommendation =
      anomalyScoreBps > 6000 ? 2 : anomalyScoreBps > 3000 || scoreBps < 5000 ? 1 : 0;

    // Recommended amount: full when APPROVE, 70% when REVIEW, 0 when REJECT.
    let recommendedAmount: bigint = input.requestedAmount;
    if (recommendation === 1) recommendedAmount = (input.requestedAmount * 7n) / 10n;
    if (recommendation === 2) recommendedAmount = 0n;

    const description = input.description ?? '';
    const sourceHash = sourceHashOf({
      claimId: input.claimId,
      requestedAmount: input.requestedAmount,
      description,
      provider: 'mock',
    });

    return {
      claimId: input.claimId,
      scoreBps,
      anomalyScoreBps,
      confidenceBps,
      recommendation,
      recommendedAmount,
      sourceHash,
      provider: 'mock',
      raw: { scoreBps, anomalyScoreBps, confidenceBps, recommendation, description },
    };
  }
}

/**
 * Real Braino.ai/WAVENURE provider (spec S3, `POST /v1/assess`).
 *
 * Advisory only: the draft it returns is reviewed and published by a human holding
 * ORACLE_ROLE; the Claims Committee and the dispute window are never bypassed.
 */
export class BrainoAIAssessor implements AIAssessorProvider {
  readonly name = 'braino' as const;
  private readonly config: BrainoConfig;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(config: BrainoConfig, fetchImpl?: typeof fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async assess(input: ClaimAssessmentInput): Promise<AssessmentDraft> {
    const ctx = input.context;
    if (!ctx) throw new BrainoError('context', 'claim context is required to assess a claim');
    if (ctx.claimType === 'PARAMETRIC') {
      // Spec §3 S3: parametric claims settle from objective oracle data, not from this path.
      throw new BrainoError('context', 'parametric claims are not assessed by the AI provider');
    }

    const evidence =
      ctx.evidence && ctx.evidence.length > 0
        ? ctx.evidence
        : [{ contentHash: ctx.evidenceHash, contentType: 'application/octet-stream' }];

    const request: ClaimAssessmentRequest = {
      claimId: input.claimId.toString(),
      portfolioId: ctx.portfolioId.toString(),
      requestedAmount: unitsToDecimal(input.requestedAmount),
      coverageLimit: unitsToDecimal(ctx.coverageLimit),
      policyTerms: ctx.policyTerms,
      evidence,
      description: input.description ?? '',
    };

    const a = await assessClaim(this.config, request, input.requestedAmount, {
      fetchImpl: this.fetchImpl,
    });
    const recommendation: Recommendation =
      a.recommendation === 'APPROVE' ? 0 : a.recommendation === 'REVIEW' ? 1 : 2;

    return {
      claimId: input.claimId,
      scoreBps: a.scoreBps,
      anomalyScoreBps: a.anomalyScoreBps,
      confidenceBps: a.confidenceBps,
      recommendation,
      recommendedAmount: a.recommendedAmount,
      sourceHash: a.sourceHash,
      provider: 'braino',
      // The raw body is the audit artifact (spec §5): kept byte for byte.
      raw: {
        reportId: a.reportId,
        modelVersion: a.modelVersion,
        asOf: a.asOf,
        criteria: a.criteria,
        rawBody: a.rawBody,
      },
    };
  }
}

/**
 * The mock was selected (or defaulted) where only real data may be shown. The cron
 * route answers "idle" rather than producing a draft nobody can justify on-chain.
 */
export class MockProviderForbiddenError extends Error {
  constructor() {
    super('AI_ASSESSOR_PROVIDER resolves to the mock provider on production');
    this.name = 'MockProviderForbiddenError';
  }
}

export function getAIAssessorProvider(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: typeof fetch,
): AIAssessorProvider {
  const selected = (env.AI_ASSESSOR_PROVIDER ?? 'mock').toLowerCase();
  if (selected === 'braino') {
    const cfg = brainoConfigFromEnv(env);
    if (!cfg.ok) throw new BrainoError('not_configured', cfg.problems.join('; '));
    return new BrainoAIAssessor(cfg.config, fetchImpl);
  }
  if (env.VERCEL_ENV === 'production') throw new MockProviderForbiddenError();
  return new MockAIAssessor();
}
