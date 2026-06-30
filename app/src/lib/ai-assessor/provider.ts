import { keccak256, toHex } from 'viem';

/**
 * AI claim assessor — pluggable provider (Pilot Readiness gap #5).
 *
 * MVP ships with:
 *   - `MockAIAssessor` — deterministic scoring used in pilot/CI, derived
 *      from claim id + requested amount + an optional magic substring in
 *      the description (e.g. `__ANOMALY__` flips anomaly score to 9000).
 *   - `BrainoAIAssessor` — placeholder for the real Braino.ai/WAVENURE
 *      integration; for now returns 'provider_not_configured' fast so
 *      the cron route falls through cleanly.
 *
 * Provider selection: `AI_ASSESSOR_PROVIDER=mock|braino` (default mock).
 *
 * Pure + framework-free — runs under the strip-types smoke loader.
 */

export type Recommendation = 0 | 1 | 2; // APPROVE | REVIEW | REJECT

export interface ClaimAssessmentInput {
  claimId: bigint;
  /** Requested payout in USDC base units (6 decimals). */
  requestedAmount: bigint;
  /** Free-text payload the cedant attached (description / metadata blob). */
  description?: string;
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
 * Placeholder for the real Braino.ai/WAVENURE integration. Until the API
 * contract is provisioned, this throws — the route layer catches and
 * returns 503 to operations rather than silently emitting an assessment
 * we can't justify on-chain.
 */
export class BrainoAIAssessor implements AIAssessorProvider {
  readonly name = 'braino' as const;
  async assess(_input: ClaimAssessmentInput): Promise<AssessmentDraft> {
    throw new Error('BrainoAIAssessor: provider not configured (no API key / endpoint)');
  }
}

export function getAIAssessorProvider(env: NodeJS.ProcessEnv = process.env): AIAssessorProvider {
  const selected = (env.AI_ASSESSOR_PROVIDER ?? 'mock').toLowerCase();
  if (selected === 'braino') return new BrainoAIAssessor();
  return new MockAIAssessor();
}
