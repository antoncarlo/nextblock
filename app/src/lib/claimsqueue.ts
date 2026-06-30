/**
 * Claims queue / decision-timeline derivation (Claims Control Room, sub-project 1).
 *
 * Framework-free: NO React/wagmi imports, so it runs under the Node strip-types
 * smoke loader. Operates on a structural `ClaimLike` (the existing `ClaimView`
 * from useClaimLifecycle satisfies it). Status values mirror ClaimManager.sol.
 */

export const ClaimStatusValue = {
  SUBMITTED: 0,
  ASSESSED: 1,
  DISPUTED: 2,
  APPROVED: 3,
  PAID: 4,
  REJECTED: 5,
} as const;

export type ClaimStatusNum = (typeof ClaimStatusValue)[keyof typeof ClaimStatusValue];

/** Minimal structural shape consumed from the lens `ClaimView`. */
export interface ClaimLike {
  claimId: bigint;
  vault: `0x${string}`;
  portfolioId: bigint;
  requestedAmount: bigint;
  status: number;
  submittedAt: bigint;
  challengeDeadline: bigint;
  frozen: boolean;
  disputeWindowElapsed: boolean;
  hasAssessment: boolean;
  anomalous: boolean;
  assessmentAnomalyBps: number;
}

export interface ClaimFilter {
  status?: number;
  vault?: `0x${string}`;
  anomalyOnly?: boolean;
}

/** A claim is "settled" once paid or rejected; otherwise it is pending. */
export function isSettled(status: number): boolean {
  return status === ClaimStatusValue.PAID || status === ClaimStatusValue.REJECTED;
}

export function filterClaims<T extends ClaimLike>(claims: readonly T[], f: ClaimFilter): T[] {
  return claims.filter(
    (c) =>
      (f.status === undefined || c.status === f.status) &&
      (f.vault === undefined || c.vault.toLowerCase() === f.vault.toLowerCase()) &&
      (!f.anomalyOnly || c.anomalous),
  );
}

/** Age of a claim in seconds (never negative). */
export function claimAgeSeconds(claim: ClaimLike, nowSec: bigint): bigint {
  return nowSec > claim.submittedAt ? nowSec - claim.submittedAt : 0n;
}

/** Overdue only while pending (not settled) and older than the SLA threshold. */
export function isOverdue(claim: ClaimLike, nowSec: bigint, thresholdSec: bigint): boolean {
  if (isSettled(claim.status)) return false;
  return claimAgeSeconds(claim, nowSec) > thresholdSec;
}

export type Severity = 'high' | 'normal';

/** High severity when the assessment flags an anomaly. */
const ANOMALY_HIGH_BPS = 5_000;
export function severityOf(claim: ClaimLike): Severity {
  return claim.anomalous || claim.assessmentAnomalyBps >= ANOMALY_HIGH_BPS ? 'high' : 'normal';
}

export interface TimelineStep {
  key: 'submitted' | 'assessed' | 'disputeWindow' | 'approved' | 'paid' | 'rejected';
  label: string;
  reached: boolean;
  timestamp?: bigint;
}

const S = ClaimStatusValue;

/**
 * Decision timeline from on-chain claim state. Reached flags + the two on-chain
 * timestamps (submittedAt, challengeDeadline). Per-state actor/tx history needs
 * the event indexer (sub-project 4) and is intentionally absent here.
 */
export function deriveClaimTimeline(claim: ClaimLike): TimelineStep[] {
  const past = (...statuses: number[]) => statuses.includes(claim.status);
  return [
    { key: 'submitted', label: 'Submitted', reached: true, timestamp: claim.submittedAt },
    {
      key: 'assessed',
      label: 'Assessed',
      reached: claim.hasAssessment || past(S.ASSESSED, S.DISPUTED, S.APPROVED, S.PAID),
    },
    {
      key: 'disputeWindow',
      label: 'Dispute window',
      reached: claim.disputeWindowElapsed || past(S.DISPUTED, S.APPROVED, S.PAID),
      timestamp: claim.challengeDeadline,
    },
    { key: 'approved', label: 'Approved', reached: past(S.APPROVED, S.PAID) },
    { key: 'paid', label: 'Paid', reached: past(S.PAID) },
    { key: 'rejected', label: 'Rejected', reached: past(S.REJECTED) },
  ];
}
