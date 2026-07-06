/**
 * Settlement reporting — pure derivation of per-portfolio underwriting
 * statements from INDEXED HISTORY (the protocol-subgraph SDK rows), the
 * half that lib/reporting.ts explicitly leaves out of current-state scope.
 *
 * Framework-free, bigint-exact, smoke-tested. Inputs are the typed rows
 * from lib/protocol-subgraph/entities.ts; no HTTP here — callers fetch via
 * the SDK (with its staleness verdict) and hand the rows over.
 *
 * Accounting identities enforced by construction:
 *   grossPremiums = lpQuota + protocolFees + underwritingFees (per flows seen)
 *   netUnderwritingResult = lpQuota − claimsPaid
 * Rounding follows the protocol rule (down for receivables) because figures
 * are consumed as-is from on-chain events — nothing is recomputed.
 */

import type {
  PremiumFlowRow,
  ClaimRow,
  ClaimStatus,
} from '@/lib/protocol-subgraph/entities';

export interface PremiumBreakdown {
  gross: bigint;
  lpQuota: bigint;
  protocolFees: bigint;
  underwritingFees: bigint;
}

export interface ClaimsBreakdown {
  count: number;
  requested: bigint;
  approved: bigint;
  paid: bigint;
  /** Reserve still standing (per-claim `reserved` after releases/payouts). */
  reservedOutstanding: bigint;
  byStatus: Partial<Record<ClaimStatus, number>>;
}

export interface SettlementEntry {
  timestamp: number;
  kind: string; // premium flow kind or claim status transition label
  amount: bigint;
  reference: string; // txHash or claimId
}

export interface PortfolioSettlementStatement {
  portfolioId: bigint;
  premiums: PremiumBreakdown;
  claims: ClaimsBreakdown;
  /** lpQuota premiums minus claims paid — the LP-side underwriting result. */
  netUnderwritingResult: bigint;
  /** Chronological ledger (oldest first) for the statement table. */
  timeline: SettlementEntry[];
}

/** Derive the settlement statement of one portfolio from indexed rows. */
export function buildSettlementStatement(
  portfolioId: bigint,
  premiumFlows: PremiumFlowRow[],
  claims: ClaimRow[],
): PortfolioSettlementStatement {
  const premiums: PremiumBreakdown = {
    gross: 0n,
    lpQuota: 0n,
    protocolFees: 0n,
    underwritingFees: 0n,
  };
  const timeline: SettlementEntry[] = [];

  for (const f of premiumFlows) {
    if (f.portfolioId !== portfolioId) continue;
    switch (f.kind) {
      case 'RECEIVED':
        premiums.gross += f.amount;
        break;
      case 'ALLOCATED':
        premiums.lpQuota += f.amount;
        break;
      case 'PROTOCOL_FEE':
        premiums.protocolFees += f.amount;
        break;
      case 'UNDERWRITING_FEE':
        premiums.underwritingFees += f.amount;
        break;
      default:
        // Fee CLAIMS are treasury withdrawals, not portfolio economics.
        continue;
    }
    timeline.push({ timestamp: f.timestamp, kind: f.kind, amount: f.amount, reference: f.txHash });
  }

  const claimsBreakdown: ClaimsBreakdown = {
    count: 0,
    requested: 0n,
    approved: 0n,
    paid: 0n,
    reservedOutstanding: 0n,
    byStatus: {},
  };
  for (const c of claims) {
    if (c.portfolioId !== portfolioId) continue;
    claimsBreakdown.count += 1;
    claimsBreakdown.requested += c.requestedAmount;
    if (c.approvedAmount != null) claimsBreakdown.approved += c.approvedAmount;
    if (c.paidAmount != null) claimsBreakdown.paid += c.paidAmount;
    claimsBreakdown.reservedOutstanding += c.reserved;
    claimsBreakdown.byStatus[c.status] = (claimsBreakdown.byStatus[c.status] ?? 0) + 1;
    timeline.push({
      timestamp: c.updatedAt,
      kind: `CLAIM_${c.status}`,
      amount: c.paidAmount ?? c.approvedAmount ?? c.requestedAmount,
      reference: c.claimId.toString(),
    });
  }

  timeline.sort((a, b) => a.timestamp - b.timestamp);

  return {
    portfolioId,
    premiums,
    claims: claimsBreakdown,
    netUnderwritingResult: premiums.lpQuota - claimsBreakdown.paid,
    timeline,
  };
}

/** True when the flows seen split exactly into the three quota buckets —
 *  a reconciliation check the UI surfaces instead of hiding. */
export function premiumsReconcile(p: PremiumBreakdown): boolean {
  return p.gross === p.lpQuota + p.protocolFees + p.underwritingFees;
}

export interface VaultSettlementRollup {
  portfolioCount: number;
  premiums: PremiumBreakdown;
  claimsPaid: bigint;
  reservedOutstanding: bigint;
  netUnderwritingResult: bigint;
}

/** Aggregate per-portfolio statements into a vault/book-level rollup. */
export function rollupStatements(statements: PortfolioSettlementStatement[]): VaultSettlementRollup {
  const rollup: VaultSettlementRollup = {
    portfolioCount: statements.length,
    premiums: { gross: 0n, lpQuota: 0n, protocolFees: 0n, underwritingFees: 0n },
    claimsPaid: 0n,
    reservedOutstanding: 0n,
    netUnderwritingResult: 0n,
  };
  for (const s of statements) {
    rollup.premiums.gross += s.premiums.gross;
    rollup.premiums.lpQuota += s.premiums.lpQuota;
    rollup.premiums.protocolFees += s.premiums.protocolFees;
    rollup.premiums.underwritingFees += s.premiums.underwritingFees;
    rollup.claimsPaid += s.claims.paid;
    rollup.reservedOutstanding += s.claims.reservedOutstanding;
    rollup.netUnderwritingResult += s.netUnderwritingResult;
  }
  return rollup;
}
