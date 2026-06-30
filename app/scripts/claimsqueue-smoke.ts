/**
 * Claims queue / timeline derivation smoke checks (sub-project 1).
 *
 *   node --experimental-strip-types app/scripts/claimsqueue-smoke.ts
 *
 * Scope: pure filtering, SLA age/overdue, severity and decision-timeline
 * derivation. No network, no wagmi (the lib must stay framework-free).
 */

import {
  ClaimStatusValue,
  filterClaims,
  claimAgeSeconds,
  isOverdue,
  severityOf,
  deriveClaimTimeline,
  type ClaimLike,
} from '../src/lib/claimsqueue.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const VAULT_A = '0x000000000000000000000000000000000000000A' as const;
const VAULT_B = '0x000000000000000000000000000000000000000B' as const;
const NOW = 1_000_000n; // seconds

function mk(over: Partial<ClaimLike>): ClaimLike {
  return {
    claimId: 0n,
    vault: VAULT_A,
    portfolioId: 1n,
    requestedAmount: 10_000n,
    status: ClaimStatusValue.SUBMITTED,
    submittedAt: NOW - 100n,
    challengeDeadline: NOW + 100n,
    frozen: false,
    disputeWindowElapsed: false,
    hasAssessment: false,
    anomalous: false,
    assessmentAnomalyBps: 0,
    ...over,
  };
}

const claims: ClaimLike[] = [
  mk({ claimId: 1n, status: ClaimStatusValue.SUBMITTED, vault: VAULT_A }),
  mk({ claimId: 2n, status: ClaimStatusValue.PAID, vault: VAULT_B, hasAssessment: true }),
  mk({ claimId: 3n, status: ClaimStatusValue.DISPUTED, vault: VAULT_A, anomalous: true, hasAssessment: true }),
  mk({ claimId: 4n, status: ClaimStatusValue.REJECTED, vault: VAULT_B }),
];

// --- filters ---
check('filter status SUBMITTED', filterClaims(claims, { status: ClaimStatusValue.SUBMITTED }).length === 1);
check('filter vault A', filterClaims(claims, { vault: VAULT_A }).length === 2);
check('filter anomalyOnly', filterClaims(claims, { anomalyOnly: true }).length === 1);
check('filter none returns all', filterClaims(claims, {}).length === 4);

// --- SLA age / overdue ---
check('age seconds', claimAgeSeconds(mk({ submittedAt: NOW - 500n }), NOW) === 500n);
check('overdue pending past threshold', isOverdue(mk({ status: ClaimStatusValue.SUBMITTED, submittedAt: NOW - 1000n }), NOW, 600n));
check('not overdue pending under threshold', !isOverdue(mk({ status: ClaimStatusValue.SUBMITTED, submittedAt: NOW - 100n }), NOW, 600n));
check('settled never overdue', !isOverdue(mk({ status: ClaimStatusValue.PAID, submittedAt: NOW - 100000n }), NOW, 600n));

// --- severity ---
check('anomalous high severity', severityOf(mk({ anomalous: true })) === 'high');
check('normal severity', severityOf(mk({ anomalous: false, assessmentAnomalyBps: 0 })) === 'normal');

// --- timeline ---
const tSubmitted = deriveClaimTimeline(mk({ status: ClaimStatusValue.SUBMITTED }));
check('timeline submitted reached', tSubmitted.find((s) => s.key === 'submitted')?.reached === true);
check('timeline assessed not reached when submitted', tSubmitted.find((s) => s.key === 'assessed')?.reached === false);

const tPaid = deriveClaimTimeline(mk({ status: ClaimStatusValue.PAID, hasAssessment: true }));
check('timeline paid: settled reached', tPaid.find((s) => s.key === 'paid')?.reached === true);
check('timeline paid: approved reached', tPaid.find((s) => s.key === 'approved')?.reached === true);
check('timeline paid: assessed reached', tPaid.find((s) => s.key === 'assessed')?.reached === true);

const tRejected = deriveClaimTimeline(mk({ status: ClaimStatusValue.REJECTED }));
check('timeline rejected reached', tRejected.find((s) => s.key === 'rejected')?.reached === true);
check('timeline rejected: paid not reached', tRejected.find((s) => s.key === 'paid')?.reached === false);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
