/**
 * Institutional reporting — pure derivation of LP statement, capital-adequacy and
 * exposure-concentration metrics from the canonical on-chain read model
 * (NextBlockLens VaultDashboardView + PortfolioRegistry allocations). Presentation
 * and ratio math only: no new accounting, no network, no state.
 *
 * Current-state scope: historical NAV series, realised yield and cumulative
 * payouts need the event indexer and are out of scope here.
 *
 * IMPORTANT — the SCR/MCR figures are an ILLUSTRATIVE solvency proxy for
 * institutional dashboards (capital charge on committed exposure), NOT a
 * regulated Solvency II calculation. They are clearly labelled as such in the UI.
 */

const BPS = 10_000n;

export interface PortfolioExposure {
  id: bigint;
  allocation: bigint; // committed underwriting capital, USDC (6dp)
  expectedLossBps: number; // Braino.ai / curator expected-loss score
}

export interface ReportingInput {
  // NAV / shares
  totalAssets: bigint; // vault NAV (own funds proxy)
  totalShares: bigint;
  // liabilities (already netted into NAV; surfaced for the statement)
  unearnedPremiums: bigint;
  pendingClaims: bigint;
  // exposure
  portfolioAllocated: bigint; // total committed underwriting capital
  availableBuffer: bigint;
  portfolios: PortfolioExposure[];
  // illustrative risk configuration
  scrRiskChargeBps: number; // capital charge on committed exposure (e.g. 5000 = 50%)
  mcrFractionBps: number; // MCR as a fraction of SCR (e.g. 4000 = 40%)
  concentrationLimitBps: number; // per-portfolio cap (e.g. 4000 = 40%)
}

export interface NavStatement {
  /** Assets backing one 1e18 share (round down — conservative to the LP). */
  navPerShare1e18: bigint;
  totalAssets: bigint;
  totalShares: bigint;
  unearnedPremiums: bigint;
  pendingClaims: bigint;
}

export interface CapitalAdequacy {
  ownFunds: bigint; // ≈ NAV
  scr: bigint; // illustrative Solvency Capital Requirement proxy
  mcr: bigint; // illustrative Minimum Capital Requirement proxy
  expectedLoss: bigint; // Σ allocation * expectedLossBps
  hasExposure: boolean;
  /** ownFunds / SCR in bps (10000 = 100%); 0 when there is no exposure. */
  solvencyRatioBps: number;
  /** ownFunds / MCR in bps; 0 when there is no exposure. */
  mcrCoverageBps: number;
  scrBreached: boolean; // ownFunds < SCR (under-capitalised vs target)
  mcrBreached: boolean; // ownFunds < MCR (critical)
}

export interface ConcentrationEntry {
  id: bigint;
  allocation: bigint;
  shareBps: number; // allocation / totalAllocated
  overLimit: boolean;
}

export interface ConcentrationReport {
  totalAllocated: bigint;
  maxShareBps: number;
  /** Herfindahl-Hirschman index in bps (Σ shareFraction²): 10000 = fully concentrated. */
  herfindahlBps: number;
  limitBps: number;
  breaches: number;
  entries: ConcentrationEntry[];
}

export interface InstitutionalReport {
  nav: NavStatement;
  capital: CapitalAdequacy;
  concentration: ConcentrationReport;
}

/** Assets backing one 1e18 share, rounded down (conservative to the LP). */
export function navPerShare1e18(totalAssets: bigint, totalShares: bigint): bigint {
  if (totalShares <= 0n) return 0n;
  return (totalAssets * 10n ** 18n) / totalShares;
}

/** Current redeemable value of an LP holding at the reported NAV/share. */
export function lpHoldingValue(userShares: bigint, navPerShare: bigint): bigint {
  return (userShares * navPerShare) / 10n ** 18n;
}

export function deriveNavStatement(i: ReportingInput): NavStatement {
  return {
    navPerShare1e18: navPerShare1e18(i.totalAssets, i.totalShares),
    totalAssets: i.totalAssets,
    totalShares: i.totalShares,
    unearnedPremiums: i.unearnedPremiums,
    pendingClaims: i.pendingClaims,
  };
}

export function deriveCapitalAdequacy(i: ReportingInput): CapitalAdequacy {
  const ownFunds = i.totalAssets;

  let expectedLoss = 0n;
  for (const p of i.portfolios) {
    expectedLoss += (p.allocation * BigInt(Math.max(0, p.expectedLossBps))) / BPS;
  }

  // Capital charge on committed exposure (illustrative). Round UP — a liability /
  // requirement convention, never understating the capital we must hold.
  const charge = BigInt(Math.max(0, i.scrRiskChargeBps));
  const scr = ceilMulDivBps(i.portfolioAllocated, charge);
  const mcr = ceilMulDivBps(scr, BigInt(Math.max(0, i.mcrFractionBps)));

  const hasExposure = scr > 0n;
  const solvencyRatioBps = hasExposure ? Number((ownFunds * BPS) / scr) : 0;
  const mcrCoverageBps = mcr > 0n ? Number((ownFunds * BPS) / mcr) : 0;

  return {
    ownFunds,
    scr,
    mcr,
    expectedLoss,
    hasExposure,
    solvencyRatioBps,
    mcrCoverageBps,
    scrBreached: hasExposure && ownFunds < scr,
    mcrBreached: mcr > 0n && ownFunds < mcr,
  };
}

export function deriveConcentration(
  portfolios: PortfolioExposure[],
  limitBps: number,
): ConcentrationReport {
  let totalAllocated = 0n;
  for (const p of portfolios) totalAllocated += p.allocation;

  let maxShareBps = 0;
  let herfindahlBps = 0;
  let breaches = 0;
  const entries: ConcentrationEntry[] = portfolios.map((p) => {
    const shareBps = totalAllocated > 0n ? Number((p.allocation * BPS) / totalAllocated) : 0;
    const overLimit = shareBps > limitBps;
    if (shareBps > maxShareBps) maxShareBps = shareBps;
    herfindahlBps += Math.floor((shareBps * shareBps) / 10_000);
    if (overLimit) breaches += 1;
    return { id: p.id, allocation: p.allocation, shareBps, overLimit };
  });

  return { totalAllocated, maxShareBps, herfindahlBps, limitBps, breaches, entries };
}

/** Compose the full institutional report. Pure. */
export function deriveInstitutionalReport(i: ReportingInput): InstitutionalReport {
  return {
    nav: deriveNavStatement(i),
    capital: deriveCapitalAdequacy(i),
    concentration: deriveConcentration(i.portfolios, i.concentrationLimitBps),
  };
}

/** value * bps / 10000, rounded UP (requirement/liability convention). */
function ceilMulDivBps(value: bigint, bps: bigint): bigint {
  if (value <= 0n || bps <= 0n) return 0n;
  return (value * bps + (BPS - 1n)) / BPS;
}

/** Format a basis-points ratio as a percentage string (2 decimals). */
export function ratioBpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
