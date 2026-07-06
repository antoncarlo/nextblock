/**
 * Protocol-subgraph entities — typed rows + pure raw→typed parsers.
 *
 * Mirrors indexer/schema.graphql (the nextblock-protocol subgraph, NOT the
 * legacy no-code redemption endpoint served by lib/subgraph.ts). GraphQL
 * returns every numeric as a string; parsers normalise to bigint for asset
 * amounts and number for timestamps/bps. Framework-free and smoke-tested —
 * no HTTP in this module.
 */

// ─── Status unions (mirror the UPPER_SNAKE strings written by the mappings) ──

export type PortfolioStatus =
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'EXPIRED';

export type ClaimStatus =
  | 'SUBMITTED'
  | 'ASSESSED'
  | 'DISPUTED'
  | 'FROZEN'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAID';

export type AssertionStatus = 'PROPOSED' | 'DISPUTED' | 'FINALIZED' | 'REJECTED';
export type ProposalStatus = 'PROPOSED' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED';
export type PremiumFlowKind =
  | 'RECEIVED'
  | 'ALLOCATED'
  | 'PROTOCOL_FEE'
  | 'UNDERWRITING_FEE'
  | 'PROTOCOL_FEES_CLAIMED'
  | 'UNDERWRITING_FEES_CLAIMED';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function big(s: string | null | undefined): bigint {
  if (s == null) return 0n;
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
}

function num(s: string | null | undefined): number {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

// ─── Vault ───────────────────────────────────────────────────────────────────

export interface RawVault {
  id: string;
  name: string;
  symbol: string;
  displayName: string;
  manager: string;
  bufferRatioBps: string;
  managementFeeBps: string;
  createdAt: string;
  depositCount: number;
  withdrawCount: number;
  totalDeposited: string;
  totalWithdrawn: string;
  premiumsRecorded: string;
  claimsReserved: string;
  claimsPaid: string;
  feesCollected: string;
}

export interface VaultRow {
  address: string;
  name: string;
  symbol: string;
  displayName: string;
  manager: string;
  bufferRatioBps: number;
  managementFeeBps: number;
  createdAt: number;
  depositCount: number;
  withdrawCount: number;
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  premiumsRecorded: bigint;
  claimsReserved: bigint;
  claimsPaid: bigint;
  feesCollected: bigint;
}

export function parseVaults(rows: RawVault[]): VaultRow[] {
  return rows.map((r) => ({
    address: r.id,
    name: r.name,
    symbol: r.symbol,
    displayName: r.displayName,
    manager: r.manager,
    bufferRatioBps: num(r.bufferRatioBps),
    managementFeeBps: num(r.managementFeeBps),
    createdAt: num(r.createdAt),
    depositCount: r.depositCount,
    withdrawCount: r.withdrawCount,
    totalDeposited: big(r.totalDeposited),
    totalWithdrawn: big(r.totalWithdrawn),
    premiumsRecorded: big(r.premiumsRecorded),
    claimsReserved: big(r.claimsReserved),
    claimsPaid: big(r.claimsPaid),
    feesCollected: big(r.feesCollected),
  }));
}

// ─── LP flows ────────────────────────────────────────────────────────────────

export interface RawVaultFlow {
  id: string;
  vault: { id: string };
  owner: string;
  assets: string;
  shares: string;
  timestamp: string;
  txHash: string;
}

export interface VaultFlowRow {
  id: string;
  vault: string;
  owner: string;
  assets: bigint;
  shares: bigint;
  timestamp: number;
  txHash: string;
}

export function parseVaultFlows(rows: RawVaultFlow[]): VaultFlowRow[] {
  return rows.map((r) => ({
    id: r.id,
    vault: r.vault.id,
    owner: r.owner,
    assets: big(r.assets),
    shares: big(r.shares),
    timestamp: num(r.timestamp),
    txHash: r.txHash,
  }));
}

// ─── Portfolio ───────────────────────────────────────────────────────────────

export interface RawPortfolio {
  id: string;
  cedant: string;
  structureType: number;
  coverageLimit: string;
  cededPremium: string;
  inceptionTime: string;
  expiryTime: string;
  status: string;
  expectedLossBps: number;
  vault: string | null;
  allocated: string;
  premiumsReceivedGross: string;
  submittedAt: string;
  updatedAt: string;
}

export interface PortfolioRow {
  portfolioId: bigint;
  cedant: string;
  structureType: number;
  coverageLimit: bigint;
  cededPremium: bigint;
  inceptionTime: number;
  expiryTime: number;
  status: PortfolioStatus;
  expectedLossBps: number;
  vault: string | null;
  allocated: bigint;
  premiumsReceivedGross: bigint;
  submittedAt: number;
  updatedAt: number;
}

export function parsePortfolios(rows: RawPortfolio[]): PortfolioRow[] {
  return rows.map((r) => ({
    portfolioId: big(r.id),
    cedant: r.cedant,
    structureType: r.structureType,
    coverageLimit: big(r.coverageLimit),
    cededPremium: big(r.cededPremium),
    inceptionTime: num(r.inceptionTime),
    expiryTime: num(r.expiryTime),
    status: r.status as PortfolioStatus,
    expectedLossBps: r.expectedLossBps,
    vault: r.vault,
    allocated: big(r.allocated),
    premiumsReceivedGross: big(r.premiumsReceivedGross),
    submittedAt: num(r.submittedAt),
    updatedAt: num(r.updatedAt),
  }));
}

// ─── Claim ───────────────────────────────────────────────────────────────────

export interface RawClaim {
  id: string;
  portfolioId: string;
  vault: string;
  claimant: string;
  requestedAmount: string;
  claimType: number;
  status: string;
  anomalyFlagged: boolean;
  approvedAmount: string | null;
  paidAmount: string | null;
  reserved: string;
  submittedAt: string;
  updatedAt: string;
}

export interface ClaimRow {
  claimId: bigint;
  portfolioId: bigint;
  vault: string;
  claimant: string;
  requestedAmount: bigint;
  claimType: number;
  status: ClaimStatus;
  anomalyFlagged: boolean;
  approvedAmount: bigint | null;
  paidAmount: bigint | null;
  reserved: bigint;
  submittedAt: number;
  updatedAt: number;
}

export function parseClaims(rows: RawClaim[]): ClaimRow[] {
  return rows.map((r) => ({
    claimId: big(r.id),
    portfolioId: big(r.portfolioId),
    vault: r.vault,
    claimant: r.claimant,
    requestedAmount: big(r.requestedAmount),
    claimType: r.claimType,
    status: r.status as ClaimStatus,
    anomalyFlagged: r.anomalyFlagged,
    approvedAmount: r.approvedAmount == null ? null : big(r.approvedAmount),
    paidAmount: r.paidAmount == null ? null : big(r.paidAmount),
    reserved: big(r.reserved),
    submittedAt: num(r.submittedAt),
    updatedAt: num(r.updatedAt),
  }));
}

// ─── Premium flows ───────────────────────────────────────────────────────────

export interface RawPremiumFlow {
  id: string;
  portfolioId: string;
  kind: string;
  counterparty: string | null;
  amount: string;
  timestamp: string;
  txHash: string;
}

export interface PremiumFlowRow {
  id: string;
  portfolioId: bigint;
  kind: PremiumFlowKind;
  counterparty: string | null;
  amount: bigint;
  timestamp: number;
  txHash: string;
}

export function parsePremiumFlows(rows: RawPremiumFlow[]): PremiumFlowRow[] {
  return rows.map((r) => ({
    id: r.id,
    portfolioId: big(r.portfolioId),
    kind: r.kind as PremiumFlowKind,
    counterparty: r.counterparty,
    amount: big(r.amount),
    timestamp: num(r.timestamp),
    txHash: r.txHash,
  }));
}

// ─── NAV series ──────────────────────────────────────────────────────────────

export interface RawNavPoint {
  id: string;
  vault: string;
  nav: string;
  confidenceBps: number;
  timestamp: string;
}

export interface NavPointRow {
  id: string;
  vault: string;
  nav: bigint;
  confidenceBps: number;
  timestamp: number;
}

export function parseNavPoints(rows: RawNavPoint[]): NavPointRow[] {
  return rows.map((r) => ({
    id: r.id,
    vault: r.vault,
    nav: big(r.nav),
    confidenceBps: r.confidenceBps,
    timestamp: num(r.timestamp),
  }));
}

// ─── Activity feed ───────────────────────────────────────────────────────────

export interface RawProtocolEvent {
  id: string;
  contract: string;
  name: string;
  vault: string | null;
  portfolioId: string | null;
  claimId: string | null;
  actor: string | null;
  amount: string | null;
  timestamp: string;
  txHash: string;
}

export interface ProtocolEventRow {
  id: string;
  contract: string;
  name: string;
  vault: string | null;
  portfolioId: bigint | null;
  claimId: bigint | null;
  actor: string | null;
  amount: bigint | null;
  timestamp: number;
  txHash: string;
}

export function parseProtocolEvents(rows: RawProtocolEvent[]): ProtocolEventRow[] {
  return rows.map((r) => ({
    id: r.id,
    contract: r.contract,
    name: r.name,
    vault: r.vault,
    portfolioId: r.portfolioId == null ? null : big(r.portfolioId),
    claimId: r.claimId == null ? null : big(r.claimId),
    actor: r.actor,
    amount: r.amount == null ? null : big(r.amount),
    timestamp: num(r.timestamp),
    txHash: r.txHash,
  }));
}

// ─── Compliance ──────────────────────────────────────────────────────────────

export interface RawComplianceAccount {
  id: string;
  whitelisted: boolean;
  blocked: boolean;
  jurisdiction: number;
  kycExpiry: string;
  investorLimit: string;
  updatedAt: string;
}

export interface ComplianceAccountRow {
  address: string;
  whitelisted: boolean;
  blocked: boolean;
  jurisdiction: number;
  kycExpiry: number;
  investorLimit: bigint;
  updatedAt: number;
}

export function parseComplianceAccounts(rows: RawComplianceAccount[]): ComplianceAccountRow[] {
  return rows.map((r) => ({
    address: r.id,
    whitelisted: r.whitelisted,
    blocked: r.blocked,
    jurisdiction: r.jurisdiction,
    kycExpiry: num(r.kycExpiry),
    investorLimit: big(r.investorLimit),
    updatedAt: num(r.updatedAt),
  }));
}
