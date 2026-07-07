/**
 * Oracle node — SERVER-ONLY single-file lib (repo pure-lib convention).
 *
 * Three concerns of the NAV/AI publisher node from the Braino integration
 * spec (contracts/docs/integrations/braino-oracle-spec.md):
 *   1. Reference canonical-JSON serializer + sourceHash (§5 evidence protocol):
 *      sourceHash = keccak256(canonical_json(report)); canonical = sorted
 *      keys, UTF-8, no insignificant whitespace. These bytes ARE the audit
 *      artifact the provider must persist verbatim ≥ 7 years.
 *   2. Provider-response HMAC authentication (§2): X-Braino-Signature =
 *      hex(hmac_sha256(shared_secret, raw_body)), verified over the RAW
 *      bytes exactly as received, timing-safe.
 *   3. NAV report validation → NavOracle.publishNav args. The on-chain
 *      guards (staleness, deviation, min confidence) remain the final
 *      authority; this is the node-side pre-flight, fail-closed.
 *
 * Pure module: no network, no chain. Driven by app/scripts/nav-publish.ts
 * and smoke-tested by app/scripts/oracle-node-smoke.ts.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { keccak256, toBytes, type Hex } from 'viem';

// ─── 1. Canonical JSON + sourceHash ──────────────────────────────────────────
export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

/**
 * Deterministic serialization: object keys sorted lexicographically at every
 * depth, arrays in given order, no whitespace. Rejects values JSON cannot
 * represent faithfully (undefined, NaN, ±Infinity, bigint, functions) instead
 * of silently coercing them — a hash over coerced data is a false audit trail.
 */
export function canonicalJson(value: CanonicalValue): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new Error('canonicalJson: non-finite number');
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new Error(`canonicalJson: unsupported type ${typeof value}`);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const v = (value as { [key: string]: CanonicalValue })[key];
    if (v === undefined) throw new Error(`canonicalJson: undefined value at key "${key}"`);
    parts.push(`${JSON.stringify(key)}:${canonicalJson(v)}`);
  }
  return `{${parts.join(',')}}`;
}

/** keccak256 over the UTF-8 bytes of the canonical serialization. */
export function sourceHash(report: CanonicalValue): Hex {
  return keccak256(toBytes(canonicalJson(report)));
}

// ─── 2. Provider HMAC authentication ─────────────────────────────────────────
/** hex(hmac_sha256(secret, rawBody)) — the signature a provider must send. */
export function computeBrainoSignature(rawBody: string | Uint8Array, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/** Timing-safe verification of the X-Braino-Signature header. */
export function verifyBrainoSignature(
  rawBody: string | Uint8Array,
  signatureHex: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHex || !/^[0-9a-fA-F]{64}$/.test(signatureHex)) return false;
  const expected = Buffer.from(computeBrainoSignature(rawBody, secret), 'hex');
  const provided = Buffer.from(signatureHex, 'hex');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

// ─── 3. NAV report validation → publish args ─────────────────────────────────
export interface NavReport {
  /** Vault the NAV refers to (0x…40 hex). */
  vault: string;
  /** NAV in USDC 6-decimals, as a decimal string (bigint-safe transport). */
  nav: string;
  /** Provider confidence ∈ [0,1] — honest, never coerced to 1. */
  confidence: number;
  /** Provider report id — must retrieve the byte-identical report ≥ 7 years. */
  reportId: string;
  /** Model version — bumped on any result-changing model change. */
  modelVersion: string;
  /** Unix seconds when the provider generated the figure. */
  generatedAt: number;
}

export interface PublishNavArgs {
  vault: `0x${string}`;
  nav: bigint;
  confidenceBps: number;
  sourceHash: Hex;
}

export type NavValidation =
  | { ok: true; args: PublishNavArgs }
  | { ok: false; errors: string[] };

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
/** Reject payloads older than this — a stale figure must not be published. */
export const MAX_REPORT_AGE_SECONDS = 900;

/** Validate a NAV report and derive the publishNav arguments. */
export function validateNavReport(report: NavReport, nowSeconds: number): NavValidation {
  const errors: string[] = [];

  if (!ADDRESS_RE.test(report.vault ?? '')) errors.push('vault must be a 0x…40-hex address');

  let nav = 0n;
  if (typeof report.nav !== 'string' || !/^[0-9]+$/.test(report.nav)) {
    errors.push('nav must be a decimal string (USDC 6dp)');
  } else {
    nav = BigInt(report.nav);
    if (nav === 0n) errors.push('nav must be positive');
  }

  if (typeof report.confidence !== 'number' || !(report.confidence >= 0 && report.confidence <= 1)) {
    errors.push('confidence must be within [0,1]');
  }
  if (typeof report.reportId !== 'string' || report.reportId.trim().length === 0) {
    errors.push('reportId is required');
  }
  if (typeof report.modelVersion !== 'string' || report.modelVersion.trim().length === 0) {
    errors.push('modelVersion is required');
  }
  if (!Number.isInteger(report.generatedAt) || report.generatedAt <= 0) {
    errors.push('generatedAt must be unix seconds');
  } else if (nowSeconds - report.generatedAt > MAX_REPORT_AGE_SECONDS) {
    errors.push(`report is stale (older than ${MAX_REPORT_AGE_SECONDS}s)`);
  } else if (report.generatedAt - nowSeconds > 60) {
    errors.push('generatedAt is in the future beyond clock skew');
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    args: {
      vault: report.vault.toLowerCase() as `0x${string}`,
      nav,
      confidenceBps: Math.round(report.confidence * 10_000),
      // The hash anchors the WHOLE report object, not just the numbers.
      sourceHash: sourceHash(report as unknown as CanonicalValue),
    },
  };
}
