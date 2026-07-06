/**
 * Settlement-reporting smoke checks (pure, no network).
 *
 *   node --experimental-strip-types app/scripts/settlement-smoke.ts
 *
 * Scope: per-portfolio statement derivation from indexed rows (premium
 * bucketing, claim aggregation, timeline ordering, portfolio filtering,
 * fee-claim exclusion), reconciliation check, negative net result, rollup.
 */

import {
  buildSettlementStatement,
  premiumsReconcile,
  rollupStatements,
} from '../src/lib/settlement.ts';
import type { PremiumFlowRow, ClaimRow } from '../src/lib/protocol-subgraph/entities.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const PID = 7n;

const flows: PremiumFlowRow[] = [
  { id: 'f1', portfolioId: PID, kind: 'RECEIVED', counterparty: '0xced', amount: 40_000_000n, timestamp: 100, txHash: '0xa1' },
  { id: 'f2', portfolioId: PID, kind: 'ALLOCATED', counterparty: '0xvault', amount: 30_000_000n, timestamp: 101, txHash: '0xa2' },
  { id: 'f3', portfolioId: PID, kind: 'PROTOCOL_FEE', counterparty: null, amount: 4_000_000n, timestamp: 102, txHash: '0xa3' },
  { id: 'f4', portfolioId: PID, kind: 'UNDERWRITING_FEE', counterparty: null, amount: 6_000_000n, timestamp: 103, txHash: '0xa4' },
  // Treasury withdrawal: portfolio 0, must be excluded from economics.
  { id: 'f5', portfolioId: 0n, kind: 'PROTOCOL_FEES_CLAIMED', counterparty: '0xowner', amount: 4_000_000n, timestamp: 104, txHash: '0xa5' },
  // Another portfolio: must be filtered out.
  { id: 'f6', portfolioId: 9n, kind: 'RECEIVED', counterparty: '0xced2', amount: 99_000_000n, timestamp: 105, txHash: '0xa6' },
];

const claims: ClaimRow[] = [
  { claimId: 3n, portfolioId: PID, vault: '0xv', claimant: '0xced', requestedAmount: 30_000_000n, claimType: 2, status: 'PAID', anomalyFlagged: false, approvedAmount: 25_000_000n, paidAmount: 25_000_000n, reserved: 0n, submittedAt: 50, updatedAt: 200 },
  { claimId: 4n, portfolioId: PID, vault: '0xv', claimant: '0xced', requestedAmount: 10_000_000n, claimType: 2, status: 'APPROVED', anomalyFlagged: false, approvedAmount: 8_000_000n, paidAmount: null, reserved: 8_000_000n, submittedAt: 60, updatedAt: 150 },
  { claimId: 5n, portfolioId: 9n, vault: '0xv', claimant: '0xced2', requestedAmount: 1_000_000n, claimType: 0, status: 'SUBMITTED', anomalyFlagged: false, approvedAmount: null, paidAmount: null, reserved: 0n, submittedAt: 70, updatedAt: 70 },
];

const s = buildSettlementStatement(PID, flows, claims);

// ─── Premium bucketing ───────────────────────────────────────────────────────
check('gross premiums', s.premiums.gross === 40_000_000n);
check('lp quota', s.premiums.lpQuota === 30_000_000n);
check('protocol fees', s.premiums.protocolFees === 4_000_000n);
check('underwriting fees', s.premiums.underwritingFees === 6_000_000n);
check('fee claims excluded from economics', !s.timeline.some((e) => e.kind === 'PROTOCOL_FEES_CLAIMED'));
check('other portfolios filtered', !s.timeline.some((e) => e.reference === '0xa6' || e.reference === '5'));
check('premiums reconcile (40 = 30+4+6)', premiumsReconcile(s.premiums));

// ─── Claims aggregation ──────────────────────────────────────────────────────
check('claim count', s.claims.count === 2);
check('requested total', s.claims.requested === 40_000_000n);
check('approved total', s.claims.approved === 33_000_000n);
check('paid total', s.claims.paid === 25_000_000n);
check('reserve outstanding', s.claims.reservedOutstanding === 8_000_000n);
check('status histogram', s.claims.byStatus.PAID === 1 && s.claims.byStatus.APPROVED === 1);

// ─── Net result + timeline ───────────────────────────────────────────────────
check('net underwriting result (30 − 25 = 5)', s.netUnderwritingResult === 5_000_000n);
check('timeline oldest-first', s.timeline[0].timestamp <= s.timeline[s.timeline.length - 1].timestamp);
check('timeline includes claim transitions', s.timeline.some((e) => e.kind === 'CLAIM_PAID'));
check('timeline sizes (4 flows + 2 claims)', s.timeline.length === 6);

// ─── Negative net result ─────────────────────────────────────────────────────
const heavy = buildSettlementStatement(PID, flows, [
  { ...claims[0], paidAmount: 45_000_000n, approvedAmount: 45_000_000n },
]);
check('negative net result preserved', heavy.netUnderwritingResult === 30_000_000n - 45_000_000n);

// ─── Reconciliation failure surfaced ─────────────────────────────────────────
check(
  'non-reconciling premiums detected',
  !premiumsReconcile({ gross: 40_000_000n, lpQuota: 30_000_000n, protocolFees: 4_000_000n, underwritingFees: 5_000_000n }),
);

// ─── Empty inputs ────────────────────────────────────────────────────────────
const empty = buildSettlementStatement(999n, flows, claims);
check('unknown portfolio yields empty statement', empty.premiums.gross === 0n && empty.claims.count === 0 && empty.timeline.length === 0);

// ─── Rollup ──────────────────────────────────────────────────────────────────
const other = buildSettlementStatement(9n, flows, claims);
const rollup = rollupStatements([s, other]);
check('rollup portfolio count', rollup.portfolioCount === 2);
check('rollup gross premiums', rollup.premiums.gross === 40_000_000n + 99_000_000n);
check('rollup net result additive', rollup.netUnderwritingResult === s.netUnderwritingResult + other.netUnderwritingResult);

// ─── Verdict ─────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL PASS');
