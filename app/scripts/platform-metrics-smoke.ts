/**
 * Platform-metrics smoke checks (pure, no network).
 *
 *   node --experimental-strip-types app/scripts/platform-metrics-smoke.ts
 *
 * Scope: protocol aggregation, allocation slices (including the residual),
 * share price scaling across 18/6 decimals, and the TVL-weighted reserve floor.
 */

import {
  aggregatePlatform,
  capitalAllocation,
  vaultAllocation,
  sharePrice,
  reserveHealth,
  bpsOf,
  fmtBps,
  type VaultSnapshot,
} from '../src/lib/platform-metrics.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const u = (n: number) => BigInt(Math.round(n * 1e6)); // USDC 6dp
const s = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n; // shares 18dp

const vaults: VaultSnapshot[] = [
  {
    address: '0xa',
    name: 'Balanced Core',
    totalAssets: u(1_000_000),
    totalSupply: s(1_000_000),
    availableBuffer: u(200_000),
    deployedCapital: u(750_000),
    pendingClaims: u(50_000),
    bufferRatioBps: 2000,
    policyCount: 12,
  },
  {
    address: '0xb',
    name: 'Parametric Shield',
    totalAssets: u(500_000),
    totalSupply: s(400_000), // NAV grew: share price > 1
    availableBuffer: u(150_000),
    deployedCapital: u(350_000),
    pendingClaims: 0n,
    bufferRatioBps: 3000,
    policyCount: 5,
  },
];

// ─── Aggregation ─────────────────────────────────────────────────────────────
const t = aggregatePlatform(vaults, 1);
check('vault count', t.vaultCount === 2);
check('unreadable carried through', t.unreadableCount === 1);
check('tvl summed', t.tvl === u(1_500_000));
check('deployed summed', t.deployedCapital === u(1_100_000));
check('buffer summed', t.availableBuffer === u(350_000));
check('reserves summed', t.claimReserves === u(50_000));
check('policies summed', t.policyCount === 17);
check('utilisation bps (1.1M/1.5M)', t.utilisationBps === 7333);
check('buffer bps (350k/1.5M)', t.bufferBps === 2333);

// Empty protocol must not divide by zero.
const empty = aggregatePlatform([]);
check('empty protocol is zeroed, not NaN', empty.tvl === 0n && empty.utilisationBps === 0);
check('bpsOf guards zero denominator', bpsOf(5n, 0n) === 0);

// ─── Capital allocation ──────────────────────────────────────────────────────
const cap = capitalAllocation(t);
// This fixture accounts for the whole TVL, so the residual is empty and must
// NOT render as a zero slice.
check('fully accounted TVL yields exactly three slices', cap.length === 3);
check('deployed slice first', cap[0].label === 'Deployed to underwriting');
check('no empty residual slice', cap.every((sl) => sl.label !== 'Other'));
check('slices reconcile with TVL', cap.reduce((acc, sl) => acc + sl.value, 0n) === t.tvl);

// Accrued fees / rounding leave TVL above the three buckets: the difference has
// to be shown, never absorbed silently.
const withResidual = aggregatePlatform([{ ...vaults[0], totalAssets: u(1_100_000) }]);
const capResidual = capitalAllocation(withResidual);
check('residual surfaced as its own slice', capResidual[capResidual.length - 1].label === 'Other');
check(
  'residual reconciles',
  capResidual.reduce((acc, sl) => acc + sl.value, 0n) === withResidual.tvl,
);
check('zero-value slices dropped', capitalAllocation(aggregatePlatform([])).length === 0);

// ─── Vault allocation ────────────────────────────────────────────────────────
const va = vaultAllocation(vaults, t.tvl);
check('sorted by size', va[0].label === 'Balanced Core');
check('vault shares reconcile', va.reduce((a, x) => a + x.value, 0n) === t.tvl);
check('each slice has a colour', va.every((x) => x.color.startsWith('#')));

// ─── Share price across decimals ─────────────────────────────────────────────
check('par share price', sharePrice(u(1_000_000), s(1_000_000)) === 1);
check('appreciated share price', Math.abs(sharePrice(u(500_000), s(400_000)) - 1.25) < 1e-9);
check('empty vault defaults to par', sharePrice(0n, 0n) === 1);

// ─── Reserve health ──────────────────────────────────────────────────────────
const rh = reserveHealth(vaults, t);
// TVL-weighted floor: (2000*1M + 3000*0.5M) / 1.5M = 2333
check('weighted floor', rh.requiredBps === 2333);
check('meets floor when buffer equals it', rh.meetsFloor === true);

const thin: VaultSnapshot[] = [{ ...vaults[0], availableBuffer: u(50_000) }];
const tThin = aggregatePlatform(thin);
check('shortfall detected', reserveHealth(thin, tThin).meetsFloor === false);

// ─── Formatting ──────────────────────────────────────────────────────────────
check('bps formatting', fmtBps(7333) === '73.33%');

if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL PASS');
