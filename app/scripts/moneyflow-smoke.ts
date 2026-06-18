/**
 * Money Flow derivation smoke checks (current-state).
 *
 * Runs with the Node 22 TypeScript strip-types loader, no test framework:
 *
 *   node --experimental-strip-types app/scripts/moneyflow-smoke.ts
 *
 * Scope: the pure `deriveMoneyFlow` mapping of Lens fields to the Figma Money
 * Flow cards + bps formatting + zero-asset boundary. No network, no wagmi.
 */

import { deriveMoneyFlow, bpsToPct, type MoneyFlowInput } from '../src/lib/moneyflow.ts';

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

const input: MoneyFlowInput = {
  totalAssets: 1_000_000n * E6,
  totalShares: 1_000_000n * E18,
  sharePrice: 1n * E6,
  balance: 1_200_000n * E6,
  unearnedPremiums: 150_000n * E6,
  pendingClaims: 40_000n * E6,
  deployedCapital: 0n,
  portfolioAllocated: 300_000n * E6,
  availableBuffer: 200_000n * E6,
  bufferRatioBps: 2000n,
  protocolFeeBps: 1000n,
  accruedProtocolFees: 5_000n * E6,
  accumulatedFees: 10_000n * E6,
};

const v = deriveMoneyFlow(input);

// SPV Calculation = NAV (totalAssets) with breakdown; balance−UPR−claims−fees == nav.
check('spv nav == totalAssets', v.spvCalculation.nav === 1_000_000n * E6);
check(
  'spv breakdown reconciles to nav',
  v.spvCalculation.balance - v.spvCalculation.unearnedPremiums - v.spvCalculation.pendingClaims - v.spvCalculation.fees
    === v.spvCalculation.nav,
);

// % Buffer: 200k / 1M = 20% (2000 bps); target 2000.
check('buffer current 2000 bps', v.buffer.currentBps === 2000);
check('buffer target 2000 bps', v.buffer.targetBps === 2000);

// % Flag/Protocol = protocol fee bps.
check('protocol flag 1000 bps', v.protocolFlagBps === 1000);

// Investor Vault.
check('investor vault totalAssets', v.investorVault.totalAssets === 1_000_000n * E6);
check('investor vault sharePrice', v.investorVault.sharePrice === 1n * E6);

// Claim Payment = current reserve held.
check('claim reserve held', v.claimPayment.reserveHeld === 40_000n * E6);

// Protocol Fee accruals.
check('accrued protocol fee', v.protocolFee.accruedProtocol === 5_000n * E6);
check('management accrued fee', v.protocolFee.managementAccrued === 10_000n * E6);

// bps formatting.
check('bpsToPct 2000 -> 20.00%', bpsToPct(2000) === '20.00%');
check('bpsToPct 1000 -> 10.00%', bpsToPct(1000) === '10.00%');

// Zero-asset boundary: no div-by-zero, buffer 0%.
const zero = deriveMoneyFlow({ ...input, totalAssets: 0n, availableBuffer: 0n });
check('zero-asset buffer 0 bps', zero.buffer.currentBps === 0);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
