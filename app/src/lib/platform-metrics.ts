/**
 * Protocol-wide aggregation — pure derivation from the per-vault on-chain read
 * model, with no network access and no invented numbers.
 *
 * Every figure here is a sum or a ratio of values the vaults themselves report
 * (`NextBlockLens` / `InsuranceVault` views). Nothing is modelled, estimated or
 * back-filled: when a vault cannot be read it is EXCLUDED and counted, so the
 * UI can say how much of the protocol the totals actually cover instead of
 * silently under-reporting.
 *
 * Terminology follows the protocol, not marketing: deployed capital is capital
 * committed to underwriting, the buffer is the liquidity that stays redeemable,
 * and reserves are USDC withheld against approved claims.
 */

export interface VaultSnapshot {
  address: string;
  name: string;
  /** Vault NAV in USDC (6dp): balance − UPR − claim reserves − fees, floored. */
  totalAssets: bigint;
  /** nbRV shares outstanding (18dp). */
  totalSupply: bigint;
  /** Free liquidity available for immediate exit, USDC (6dp). */
  availableBuffer: bigint;
  /** Capital committed to underwriting, USDC (6dp). */
  deployedCapital: bigint;
  /** USDC withheld against approved-but-unpaid claims (6dp). */
  pendingClaims: bigint;
  /** Configured buffer floor, basis points. */
  bufferRatioBps: number;
  policyCount: number;
}

export interface PlatformTotals {
  vaultCount: number;
  /** Vaults whose on-chain read failed — excluded from every total below. */
  unreadableCount: number;
  tvl: bigint;
  deployedCapital: bigint;
  availableBuffer: bigint;
  claimReserves: bigint;
  policyCount: number;
  /** Share of TVL committed to underwriting, basis points. */
  utilisationBps: number;
  /** Share of TVL held as free buffer, basis points. */
  bufferBps: number;
  /** Share of TVL reserved against approved claims, basis points. */
  reserveBps: number;
}

const BPS = 10_000n;

/** Basis points of `part` over `whole`, 0 when the denominator is empty. */
export function bpsOf(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * BPS) / whole);
}

export function aggregatePlatform(vaults: VaultSnapshot[], unreadableCount = 0): PlatformTotals {
  const totals = vaults.reduce(
    (acc, v) => ({
      tvl: acc.tvl + v.totalAssets,
      deployedCapital: acc.deployedCapital + v.deployedCapital,
      availableBuffer: acc.availableBuffer + v.availableBuffer,
      claimReserves: acc.claimReserves + v.pendingClaims,
      policyCount: acc.policyCount + v.policyCount,
    }),
    { tvl: 0n, deployedCapital: 0n, availableBuffer: 0n, claimReserves: 0n, policyCount: 0 },
  );

  return {
    vaultCount: vaults.length,
    unreadableCount,
    ...totals,
    utilisationBps: bpsOf(totals.deployedCapital, totals.tvl),
    bufferBps: bpsOf(totals.availableBuffer, totals.tvl),
    reserveBps: bpsOf(totals.claimReserves, totals.tvl),
  };
}

export interface AllocationSlice {
  label: string;
  value: bigint;
  bps: number;
  color: string;
}

/** Palette shared by every allocation chart; ordered, colour-blind safe. */
const SLICE_COLORS = ['#1B3A6B', '#C9A84C', '#047857', '#B45309', '#6D28D9', '#0E7490', '#B91C1C', '#4B5563'];

/**
 * Capital allocation of the whole protocol: what the money is doing right now.
 * Deployed / buffer / reserves are mutually exclusive by construction; any
 * residual (fees accrued, rounding) is surfaced as "Other" rather than hidden.
 */
export function capitalAllocation(t: PlatformTotals): AllocationSlice[] {
  const accounted = t.deployedCapital + t.availableBuffer + t.claimReserves;
  const other = t.tvl > accounted ? t.tvl - accounted : 0n;
  const raw: Array<{ label: string; value: bigint }> = [
    { label: 'Deployed to underwriting', value: t.deployedCapital },
    { label: 'Liquidity buffer', value: t.availableBuffer },
    { label: 'Claim reserves', value: t.claimReserves },
    { label: 'Other', value: other },
  ];
  return raw
    .filter((s) => s.value > 0n)
    .map((s, i) => ({ ...s, bps: bpsOf(s.value, t.tvl), color: SLICE_COLORS[i % SLICE_COLORS.length] }));
}

/** TVL split per vault — where the protocol's capacity actually sits. */
export function vaultAllocation(vaults: VaultSnapshot[], tvl: bigint): AllocationSlice[] {
  return vaults
    .filter((v) => v.totalAssets > 0n)
    .sort((a, b) => (b.totalAssets > a.totalAssets ? 1 : -1))
    .map((v, i) => ({
      label: v.name,
      value: v.totalAssets,
      bps: bpsOf(v.totalAssets, tvl),
      color: SLICE_COLORS[i % SLICE_COLORS.length],
    }));
}

/**
 * Share price in USDC per share. Shares carry 18 decimals over a 6-decimal
 * asset, so the ratio is scaled by 1e12 before the 1e6 asset scale.
 */
export function sharePrice(totalAssets: bigint, totalSupply: bigint): number {
  if (totalSupply <= 0n) return 1;
  return Number((totalAssets * 10n ** 18n) / totalSupply) / 1e6;
}

export interface ReserveHealth {
  /** Buffer as a share of TVL, bps. */
  bufferBps: number;
  /** Weighted floor the vaults are configured to keep, bps. */
  requiredBps: number;
  /** True when the live buffer meets the configured floor. */
  meetsFloor: boolean;
  /** Claim reserves as a multiple of… nothing invented: raw coverage of TVL. */
  reserveBps: number;
}

/**
 * Reserve security: the live buffer against the floor each vault is configured
 * to hold. The floor is TVL-weighted — a large vault's policy matters more to
 * protocol-level solvency than a small one's.
 */
export function reserveHealth(vaults: VaultSnapshot[], t: PlatformTotals): ReserveHealth {
  const weighted = vaults.reduce((acc, v) => acc + BigInt(v.bufferRatioBps) * v.totalAssets, 0n);
  const requiredBps = t.tvl > 0n ? Number(weighted / t.tvl) : 0;
  return {
    bufferBps: t.bufferBps,
    requiredBps,
    meetsFloor: t.bufferBps >= requiredBps,
    reserveBps: t.reserveBps,
  };
}

/** bps → percent string, e.g. 1234 → "12.34%". */
export function fmtBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
