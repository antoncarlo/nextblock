/**
 * Smoke checks for the vault setup procedure.
 *
 *   node --experimental-strip-types app/scripts/vault-setup-progress-smoke.ts
 *
 * What matters here is not that the steps render — it is that the procedure
 * refuses to send a curator into a transaction the chain would reject, and that
 * it names the missing precondition rather than letting the wallet report an
 * unreadable gas-limit error.
 */
import assert from 'node:assert/strict';
import { deriveSetupSteps, firstActionableStep, type SetupInputs } from '../src/lib/vault-setup.ts';

let checks = 0;
function check(name: string, fn: () => void) {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
}

const EMPTY: SetupInputs = {
  hasRegisteredPolicy: false,
  hasActivePolicy: false,
  hasVaultPolicy: false,
  callerCanDeposit: false,
  premiumReceived: 0n,
};
const at = (i: SetupInputs, id: string) => deriveSetupSteps(i).find((s) => s.id === id)!;

check('a fresh vault starts at step 1', () => {
  const steps = deriveSetupSteps(EMPTY);
  assert.equal(firstActionableStep(steps), 'register');
  assert.deepEqual(steps.map((s) => s.n), [1, 2, 3, 4, 5]);
});

check('the order is register, activate, add, authorise, deposit', () => {
  // Two orderings are load-bearing. Activation must precede adding, because the
  // vault rejects a REGISTERED policy. Authorisation must precede depositing,
  // because the role is a precondition of the deposit — the page used to list
  // it last, which guaranteed the failure it existed to prevent.
  const ids = deriveSetupSteps(EMPTY).map((s) => s.id);
  assert.deepEqual(ids, ['register', 'activate', 'add', 'authorize', 'premium']);
});

check('nothing can be activated before something is registered', () => {
  assert.match(at(EMPTY, 'activate').blockedReason ?? '', /No policy has been registered/);
});

check('a registered-but-inactive policy blocks the vault step, and says why', () => {
  const i = { ...EMPTY, hasRegisteredPolicy: true };
  assert.equal(at(i, 'activate').blockedReason, undefined);
  assert.equal(firstActionableStep(deriveSetupSteps(i)), 'activate');
  assert.match(at(i, 'add').blockedReason ?? '', /PolicyNotActive/);
});

check('once active, the vault step opens', () => {
  const i = { ...EMPTY, hasRegisteredPolicy: true, hasActivePolicy: true };
  assert.equal(at(i, 'add').blockedReason, undefined);
  assert.equal(firstActionableStep(deriveSetupSteps(i)), 'add');
});

check('with no policy in the vault, depositing is blocked and says why', () => {
  assert.match(at(EMPTY, 'premium').blockedReason ?? '', /No policy has been added/);
});

check('with a policy in the vault but no role, the block names the role', () => {
  const i = { ...EMPTY, hasRegisteredPolicy: true, hasActivePolicy: true, hasVaultPolicy: true };
  assert.match(at(i, 'premium').blockedReason ?? '', /PREMIUM_DEPOSITOR_ROLE/);
  assert.equal(firstActionableStep(deriveSetupSteps(i)), 'authorize');
});

check('with policy and role, depositing is finally open', () => {
  const i = {
    ...EMPTY,
    hasRegisteredPolicy: true,
    hasActivePolicy: true,
    hasVaultPolicy: true,
    callerCanDeposit: true,
  };
  assert.equal(at(i, 'premium').blockedReason, undefined);
  assert.equal(firstActionableStep(deriveSetupSteps(i)), 'premium');
});

check('once a premium is in, every step reads done', () => {
  const steps = deriveSetupSteps({
    hasRegisteredPolicy: true,
    hasActivePolicy: true,
    hasVaultPolicy: true,
    callerCanDeposit: true,
    premiumReceived: 1_000_000n,
  });
  assert.ok(steps.every((s) => s.done));
  assert.equal(firstActionableStep(steps), 'premium');
});

check('a blocked step is never also marked done, in any combination', () => {
  const bools = [false, true];
  for (const hasRegisteredPolicy of bools)
    for (const hasActivePolicy of bools)
      for (const hasVaultPolicy of bools)
        for (const callerCanDeposit of bools)
          for (const premiumReceived of [0n, 5n])
            for (const s of deriveSetupSteps({
              hasRegisteredPolicy,
              hasActivePolicy,
              hasVaultPolicy,
              callerCanDeposit,
              premiumReceived,
            })) {
              assert.ok(!(s.done && s.blockedReason), `${s.id} both done and blocked`);
            }
});

console.log(`\n${checks} checks passed.`);
