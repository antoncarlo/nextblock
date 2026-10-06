/**
 * Smoke: what a signer must do before proposing a bordereau assertion.
 * Runs under `node --experimental-strip-types` — pure, no network.
 */
import { bondStep, bondButtonLabel, bondActionable } from '../src/lib/bordereau-bond.ts';

let failures = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) failures++;
}

const TEN = 10_000_000n;
const fmt = (n: bigint) => (Number(n) / 1e6).toString();
const idle = { approving: false, approved: false, proposing: false, proposed: false, signing: false };

// --- the stand-in oracle has no bond: the page behaves as it always did ---
check('no bond function (stand-in) -> none', bondStep({ bond: null, allowance: undefined, balance: undefined }).kind === 'none');
check('zero bond -> none', bondStep({ bond: 0n, allowance: undefined, balance: undefined }).kind === 'none');
check('none is actionable', bondActionable(bondStep({ bond: null, allowance: undefined, balance: undefined })));
check('none keeps the original label', bondButtonLabel({ kind: 'none' }, idle, fmt) === 'Propose on-chain');

// --- reads still in flight never enable a transaction ---
check('bond not yet read -> loading', bondStep({ bond: undefined, allowance: TEN, balance: TEN }).kind === 'loading');
check('allowance not yet read -> loading', bondStep({ bond: TEN, allowance: undefined, balance: TEN }).kind === 'loading');
check('balance not yet read -> loading', bondStep({ bond: TEN, allowance: TEN, balance: undefined }).kind === 'loading');
check('loading is not actionable', !bondActionable({ kind: 'loading' }));

// --- a bond is behind the oracle ---
check('balance below bond -> insufficient-balance', bondStep({ bond: TEN, allowance: TEN, balance: TEN - 1n }).kind === 'insufficient-balance');
check('insufficient-balance is not actionable', !bondActionable(bondStep({ bond: TEN, allowance: TEN, balance: 0n })));
check('balance wins over allowance', bondStep({ bond: TEN, allowance: 0n, balance: 0n }).kind === 'insufficient-balance');
check('allowance below bond -> approve', bondStep({ bond: TEN, allowance: TEN - 1n, balance: TEN }).kind === 'approve');
check('no allowance -> approve', bondStep({ bond: TEN, allowance: 0n, balance: TEN }).kind === 'approve');
check('approve is actionable', bondActionable({ kind: 'approve', bond: TEN }));
check('exact allowance and balance -> ready', bondStep({ bond: TEN, allowance: TEN, balance: TEN }).kind === 'ready');
check('unlimited allowance -> ready', bondStep({ bond: TEN, allowance: 2n ** 256n - 1n, balance: 5n * TEN }).kind === 'ready');

// --- the approval is for the bond, not more ---
const need = bondStep({ bond: TEN, allowance: 0n, balance: TEN });
check('approve carries the bond to approve', need.kind === 'approve' && need.bond === TEN);

// --- labels follow the wallet ---
check('approve label names the amount', bondButtonLabel({ kind: 'approve', bond: TEN }, idle, fmt) === 'Approve 10 USDC');
check('insufficient label names the amount', bondButtonLabel({ kind: 'insufficient-balance', bond: TEN, balance: 0n }, idle, fmt) === 'Needs 10 USDC');
check('ready label', bondButtonLabel({ kind: 'ready', bond: TEN }, idle, fmt) === 'Propose on-chain');
check('loading label', bondButtonLabel({ kind: 'loading' }, idle, fmt) === 'Reading the bond…');
check('signing label', bondButtonLabel({ kind: 'approve', bond: TEN }, { ...idle, signing: true }, fmt) === 'Sign tx…');
check('approving label', bondButtonLabel({ kind: 'approve', bond: TEN }, { ...idle, approving: true }, fmt) === 'Approving…');
check('proposing label', bondButtonLabel({ kind: 'ready', bond: TEN }, { ...idle, proposing: true }, fmt) === 'Proposing…');
check('proposed label wins', bondButtonLabel({ kind: 'ready', bond: TEN }, { ...idle, proposed: true, proposing: true }, fmt) === 'Proposed ✓');

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('bordereau-bond smoke: ok');
