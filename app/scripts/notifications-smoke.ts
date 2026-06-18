/**
 * Notification derivation smoke checks (Claims sub-project 3).
 *
 *   node --experimental-strip-types app/scripts/notifications-smoke.ts
 *
 * Scope: pure status-diff + message rendering. No network, no DB.
 */

import { ClaimStatusValue, type ClaimLike } from '../src/lib/claimsqueue.ts';
import {
  diffClaimStatus,
  renderStatusMessage,
  buildEvidenceUploadedDraft,
  normalizeAddress,
} from '../src/lib/notifications/derive.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const RECIPIENT = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa' as const;
const VAULT = '0xV1234567890abcdef1234567890abcdef1234567' as `0x${string}`;

function mkClaim(status: number, claimId: bigint = 42n): ClaimLike {
  return {
    claimId,
    vault: VAULT,
    portfolioId: 0n,
    requestedAmount: 1_000_000n,
    status,
    submittedAt: 1_700_000_000n,
    challengeDeadline: 1_700_086_400n,
    frozen: false,
    disputeWindowElapsed: false,
    hasAssessment: false,
    anomalous: false,
    assessmentAnomalyBps: 0,
  };
}

// normalizeAddress: case + tag.
check(
  'normalize lowercases address',
  normalizeAddress(RECIPIENT) === '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
);

// First sight of a non-settled claim → emit.
{
  const c = mkClaim(ClaimStatusValue.SUBMITTED);
  const d = diffClaimStatus(c, RECIPIENT, null);
  check('first-sight SUBMITTED emits', d !== null && d.kind === 'status_change' && d.fromStatus === null);
  check('first-sight message includes claimId', d !== null && d.message.includes('#42'));
}

// First sight of a settled claim → skip (don't spam about past history).
{
  const c = mkClaim(ClaimStatusValue.PAID);
  check('first-sight PAID skipped', diffClaimStatus(c, RECIPIENT, null) === null);
  const r = mkClaim(ClaimStatusValue.REJECTED);
  check('first-sight REJECTED skipped', diffClaimStatus(r, RECIPIENT, null) === null);
}

// Same status → skip.
{
  const c = mkClaim(ClaimStatusValue.ASSESSED);
  check(
    'no transition (same status) skipped',
    diffClaimStatus(c, RECIPIENT, ClaimStatusValue.ASSESSED) === null,
  );
}

// Transition → emit with from/to.
{
  const c = mkClaim(ClaimStatusValue.APPROVED);
  const d = diffClaimStatus(c, RECIPIENT, ClaimStatusValue.ASSESSED);
  check(
    'ASSESSED→APPROVED emits with from/to',
    d !== null &&
      d.fromStatus === ClaimStatusValue.ASSESSED &&
      d.toStatus === ClaimStatusValue.APPROVED,
  );
  check(
    'transition message uses labels',
    d !== null && d.message.includes('Assessed') && d.message.includes('Approved'),
  );
}

// Settled transition is still announced (PAID is meaningful for claimant).
{
  const c = mkClaim(ClaimStatusValue.PAID);
  const d = diffClaimStatus(c, RECIPIENT, ClaimStatusValue.APPROVED);
  check('APPROVED→PAID emits', d !== null && d.toStatus === ClaimStatusValue.PAID);
}

// Recipient addr is normalized on the draft.
{
  const c = mkClaim(ClaimStatusValue.SUBMITTED);
  const d = diffClaimStatus(c, RECIPIENT, null);
  check('draft normalizes recipient', d !== null && d.recipientAddr === RECIPIENT.toLowerCase());
  check('draft normalizes vault', d !== null && d.vault === VAULT.toLowerCase());
}

// renderStatusMessage: null from + valid to.
check(
  'renderStatusMessage handles null from',
  renderStatusMessage({ claimId: 7n }, null, ClaimStatusValue.SUBMITTED) ===
    'Claim #7: New → Submitted',
);

// Evidence-uploaded draft.
{
  const d = buildEvidenceUploadedDraft({
    recipientAddr: RECIPIENT,
    claimId: 99n,
    vault: VAULT,
    uploaderAddr: RECIPIENT,
    fileName: 'incident-report.pdf',
  });
  check('evidence draft kind', d.kind === 'evidence_uploaded');
  check('evidence draft includes filename', d.message.includes('incident-report.pdf'));
  check('evidence draft has no status', d.fromStatus === null && d.toStatus === null);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
