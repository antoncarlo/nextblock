/**
 * Money Flow — pure derivation of the Figma "06 — Money Flow" cards from the
 * canonical on-chain read model (NextBlockLens VaultDashboardView + premium/fee
 * fields). Presentation/aggregation only: no new accounting, no network, no state.
 *
 * Current-state scope: the historical ledger (timeline, realized yield) needs the
 * event indexer and is out of scope here.
 */

export interface MoneyFlowInput {
  totalAssets: bigint; // vault NAV (assets backing shares)
  totalShares: bigint;
  sharePrice: bigint; // assets per 1e18 shares (vault math)
  balance: bigint; // raw USDC balance
  unearnedPremiums: bigint; // UPR
  pendingClaims: bigint; // claim reserves currently held
  deployedCapital: bigint;
  portfolioAllocated: bigint;
  availableBuffer: bigint;
  bufferRatioBps: bigint; // target buffer ratio
  protocolFeeBps: bigint; // protocol take on premium (distributor)
  accruedProtocolFees: bigint; // distributor, unclaimed
  accumulatedFees: bigint; // vault management fees accrued
}

export interface MoneyFlowView {
  /** SPV Calculation: vault NAV with its accounting breakdown. */
  spvCalculation: {
    nav: bigint;
    balance: bigint;
    unearnedPremiums: bigint;
    pendingClaims: bigint;
    fees: bigint;
  };
  /** % Buffer: free liquidity vs NAV (current) against the configured target. */
  buffer: {
    current: bigint;
    totalAssets: bigint;
    currentBps: number;
    targetBps: number;
  };
  /** % Flag/Protocol: protocol fee take on premium, in bps. */
  protocolFlagBps: number;
  /** Investor Vault: the LP capital pool. */
  investorVault: {
    totalAssets: bigint;
    totalShares: bigint;
    sharePrice: bigint;
  };
  /** Claim Payment: reserve currently held (cumulative paid claims need the ledger). */
  claimPayment: {
    reserveHeld: bigint;
  };
  /** Protocol Fee: accrued (unclaimed) protocol + management fees. */
  protocolFee: {
    accruedProtocol: bigint;
    managementAccrued: bigint;
  };
}

const BPS = 10_000n;

/** Derive the Money Flow cards from the canonical read-model fields. Pure. */
export function deriveMoneyFlow(i: MoneyFlowInput): MoneyFlowView {
  const currentBps = i.totalAssets > 0n ? Number((i.availableBuffer * BPS) / i.totalAssets) : 0;
  return {
    spvCalculation: {
      nav: i.totalAssets,
      balance: i.balance,
      unearnedPremiums: i.unearnedPremiums,
      pendingClaims: i.pendingClaims,
      fees: i.accumulatedFees,
    },
    buffer: {
      current: i.availableBuffer,
      totalAssets: i.totalAssets,
      currentBps,
      targetBps: Number(i.bufferRatioBps),
    },
    protocolFlagBps: Number(i.protocolFeeBps),
    investorVault: {
      totalAssets: i.totalAssets,
      totalShares: i.totalShares,
      sharePrice: i.sharePrice,
    },
    claimPayment: {
      reserveHeld: i.pendingClaims,
    },
    protocolFee: {
      accruedProtocol: i.accruedProtocolFees,
      managementAccrued: i.accumulatedFees,
    },
  };
}

/** Format a basis-points value as a percentage string (2 decimals). */
export function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
