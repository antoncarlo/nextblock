/**
 * Notification derivation (Claims Control Room, sub-project 3).
 *
 * Pure / framework-free: no React, no wagmi, no Supabase imports — runs under
 * the Node strip-types smoke loader. The server refresh route is responsible
 * for fetching `claims` (on-chain truth, via the lens) and the per-recipient
 * `lastKnownStatus` snapshot from `notification_state`; this module decides
 * whether a transition warrants a new notification row and renders the
 * human-readable message.
 */

import { ClaimStatusValue, type ClaimLike, type ClaimStatusNum } from '../claimsqueue.ts';

export type NotificationKind = 'status_change' | 'evidence_uploaded';

/** Shape of a notification row about to be inserted into Supabase. */
export interface NotificationDraft {
  recipientAddr: `0x${string}`;
  claimId: bigint;
  vault: `0x${string}`;
  kind: NotificationKind;
  fromStatus: ClaimStatusNum | null;
  toStatus: ClaimStatusNum | null;
  message: string;
}

const STATUS_LABEL: Record<ClaimStatusNum, string> = {
  [ClaimStatusValue.SUBMITTED]: 'Submitted',
  [ClaimStatusValue.ASSESSED]: 'Assessed',
  [ClaimStatusValue.DISPUTED]: 'Disputed',
  [ClaimStatusValue.APPROVED]: 'Approved',
  [ClaimStatusValue.PAID]: 'Paid',
  [ClaimStatusValue.REJECTED]: 'Rejected',
};

/** Lowercase a 0x address; useful for stable PK comparisons with Postgres. */
export function normalizeAddress(addr: string): `0x${string}` {
  return addr.toLowerCase() as `0x${string}`;
}

/** Short, human-readable description of a status transition. */
export function renderStatusMessage(
  claim: Pick<ClaimLike, 'claimId'>,
  from: ClaimStatusNum | null,
  to: ClaimStatusNum,
): string {
  const fromLabel = from === null ? 'New' : STATUS_LABEL[from];
  const toLabel = STATUS_LABEL[to];
  return `Claim #${claim.claimId.toString()}: ${fromLabel} → ${toLabel}`;
}

/**
 * Returns a draft notification iff the claim's on-chain status differs from
 * the recipient's last-known snapshot (or no snapshot exists yet). Returns
 * `null` when there's no transition to announce.
 *
 * - First sight (lastKnownStatus = null): emit only if the claim is not yet
 *   settled, so we don't spam recipients about pre-existing settled claims.
 * - Settled→settled or same→same: skip.
 */
export function diffClaimStatus(
  claim: ClaimLike,
  recipientAddr: string,
  lastKnownStatus: number | null,
): NotificationDraft | null {
  const to = claim.status as ClaimStatusNum;

  if (lastKnownStatus === null) {
    if (to === ClaimStatusValue.PAID || to === ClaimStatusValue.REJECTED) {
      return null;
    }
    return {
      recipientAddr: normalizeAddress(recipientAddr),
      claimId: claim.claimId,
      vault: normalizeAddress(claim.vault),
      kind: 'status_change',
      fromStatus: null,
      toStatus: to,
      message: renderStatusMessage(claim, null, to),
    };
  }

  if (lastKnownStatus === to) return null;

  return {
    recipientAddr: normalizeAddress(recipientAddr),
    claimId: claim.claimId,
    vault: normalizeAddress(claim.vault),
    kind: 'status_change',
    fromStatus: lastKnownStatus as ClaimStatusNum,
    toStatus: to,
    message: renderStatusMessage(claim, lastKnownStatus as ClaimStatusNum, to),
  };
}

/** Build a draft for an evidence upload. No state-diff needed (each upload is its own event). */
export function buildEvidenceUploadedDraft(args: {
  recipientAddr: string;
  claimId: bigint;
  vault: `0x${string}`;
  uploaderAddr: string;
  fileName: string;
}): NotificationDraft {
  return {
    recipientAddr: normalizeAddress(args.recipientAddr),
    claimId: args.claimId,
    vault: normalizeAddress(args.vault),
    kind: 'evidence_uploaded',
    fromStatus: null,
    toStatus: null,
    message: `Claim #${args.claimId.toString()}: evidence uploaded (${args.fileName})`,
  };
}
