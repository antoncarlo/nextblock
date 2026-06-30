/**
 * Institutional reporting derivation smoke checks (current-state).
 *
 * Runs with the Node 22 TypeScript strip-types loader, no test framework:
 *
 *   node --experimental-strip-types app/scripts/reporting-smoke.ts
 *
 * Scope: the pure NAV statement, capital-adequacy (illustrative SCR/MCR proxy)
 * and exposure-concentration derivations + boundaries. No network, no wagmi.
 */

import {
  deriveInstitutionalReport,
  navPerShare1e18,
  lpHoldingValue,
  deriveCapitalAdequacy,
  deriveConcentration,
  ratioBpsToPct,
  type ReportingInput,
} from '../src/lib/reporting.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const E6 = 10n ** 6n;
const E18 = 10n ** 18n;

const input: ReportingInput = {
  totalAssets: 1_000_000n * E6, // 1M NAV
  totalShares: 1_000_000n * E18, // 1M shares
  unearnedPremiums: 120_000n * E6,
  pendingClaims: 30_000n * E6,
  portfolioAllocated: 800_000n * E6,
  availableBuffer: 200_000n * E6,
  portfolios: [
    { id: 1n, allocation: 500_000n * E6, expectedLossBps: 1000 }, // 62.5% share
    { id: 2n, allocation: 200_000n * E6, expectedLossBps: 500 },
    { id: 3n, allocation: 100_000n * E6, expectedLossBps: 2000 },
  ],
  scrRiskChargeBps: 5000, // 50% capital charge on exposure
  mcrFractionBps: 4000, // MCR = 40% of SCR
  concentrationLimitBps: 4000, // 40% per-portfolio cap
};

// --- NAV statement ---
const r = deriveInstitutionalReport(input);
check('navPerShare == 1 USDC (1e6)', r.nav.navPerShare1e18 === 1n * E6);
check('navPerShare helper matches', navPerShare1e18(input.totalAssets, input.totalShares) === 1n * E6);
check('lp holding value: 10k shares -> 10k USDC', lpHoldingValue(10_000n * E18, r.nav.navPerShare1e18) === 10_000n * E6);
check('navPerShare zero-shares boundary', navPerShare1e18(1n * E6, 0n) === 0n);

// --- Capital adequacy (illustrative) ---
// SCR = 800k * 50% = 400k; MCR = 400k * 40% = 160k; ownFunds = 1M.
check('scr == 400k', r.capital.scr === 400_000n * E6);
check('mcr == 160k', r.capital.mcr === 160_000n * E6);
check('ownFunds == NAV', r.capital.ownFunds === 1_000_000n * E6);
// Solvency ratio = 1M / 400k = 250% (25000 bps).
check('solvency ratio 25000 bps', r.capital.solvencyRatioBps === 25_000);
check('mcr coverage 62500 bps', r.capital.mcrCoverageBps === 62_500);
check('not scr-breached', r.capital.scrBreached === false);
check('not mcr-breached', r.capital.mcrBreached === false);
// Expected loss = 500k*10% + 200k*5% + 100k*20% = 50k+10k+20k = 80k.
check('expected loss 80k', r.capital.expectedLoss === 80_000n * E6);

// Under-capitalised boundaries (SCR=400k, MCR=160k):
// 200k own funds is below SCR but above MCR -> SCR breach only.
const weak = deriveCapitalAdequacy({ ...input, totalAssets: 200_000n * E6 });
check('weak: scr-breached', weak.scrBreached === true); // 200k < 400k
check('weak: mcr not breached', weak.mcrBreached === false); // 200k >= 160k
// 50k own funds is below MCR -> critical breach.
const veryWeak = deriveCapitalAdequacy({ ...input, totalAssets: 50_000n * E6 });
check('veryWeak: mcr-breached', veryWeak.mcrBreached === true); // 50k < 160k

// No-exposure boundary: ratios are N/A (0), nothing breached.
const noExp = deriveCapitalAdequacy({ ...input, portfolioAllocated: 0n, portfolios: [] });
check('no-exposure: scr 0', noExp.scr === 0n);
check('no-exposure: not breached', noExp.scrBreached === false && noExp.mcrBreached === false);
check('no-exposure: ratio 0 (N/A)', noExp.solvencyRatioBps === 0);

// --- Concentration ---
// shares: 500/800=62.5% (6250 bps, over 40% limit), 200/800=25%, 100/800=12.5%.
check('total allocated 800k', r.concentration.totalAllocated === 800_000n * E6);
check('max share 6250 bps', r.concentration.maxShareBps === 6250);
check('one breach (portfolio 1)', r.concentration.breaches === 1);
check('portfolio 1 over limit', r.concentration.entries[0].overLimit === true);
check('portfolio 2 within limit', r.concentration.entries[1].overLimit === false);
// HHI = 6250²/1e4 + 2500²/1e4 + 1250²/1e4 = 3906 + 625 + 156 = 4687.
check('herfindahl ~4687 bps', r.concentration.herfindahlBps === 4687);

// Empty-portfolio boundary.
const empty = deriveConcentration([], 4000);
check('empty concentration: 0 share', empty.maxShareBps === 0 && empty.breaches === 0);

// bps formatting.
check('ratioBpsToPct 25000 -> 250.00%', ratioBpsToPct(25_000) === '250.00%');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
