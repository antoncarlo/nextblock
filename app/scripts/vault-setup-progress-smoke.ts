/**
 * Smoke checks for the vault setup procedure.
 *
 *   node --experimental-strip-types app/scripts/vault-setup-progress-smoke.ts
 *
 * What matters here is not that four steps render — it is that the procedure
 * refuses to send a curator into a transaction the chain would reject, and that
 * it names the missing precondition rather than letting the wallet report an
 * unreadable gas-limit error.
 */
import assert from 'node:assert/strict';
import { deriveSetupSteps, firstActionableStep } from '../src/lib/vault-setup.ts';

let checks = 0;
function check(name: string, fn: () => void) {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
}

const fresh = { hasVaultPolicy: false, callerCanDeposit: false, premiumReceived: 0n };

check('a fresh vault starts at step 1', () => {
  const steps = deriveSetupSteps(fresh);
  assert.equal(firstActionableStep(steps), 'register');
  assert.deepEqual(steps.map((s) => s.n), [1, 2, 3, 4]);
});

check('authorising comes BEFORE depositing', () => {
  // The old page listed "Authorize Depositor" last, after "Deposit Premium".
  // The role is a precondition of the deposit, so that ordering guaranteed the
  // failure it was meant to prevent.
  const ids = deriveSetupSteps(fresh).map((s) => s.id);
  assert.ok(ids.indexOf('authorize') < ids.indexOf('premium'), `got ${ids.join(' → ')}`);
});

check('with no policy in the vault, depositing is blocked and says why', () => {
  const premium = deriveSetupSteps(fresh).find((s) => s.id === 'premium')!;
  assert.match(premium.blockedReason ?? '', /No policy has been added/);
  assert.match(premium.blockedReason ?? '', /step 2/);
});

check('with a policy but no role, the block names the role', () => {
  const steps = deriveSetupSteps({ ...fresh, hasVaultPolicy: true });
  const premium = steps.find((s) => s.id === 'premium')!;
  assert.match(premium.blockedReason ?? '', /PREMIUM_DEPOSITOR_ROLE/);
  // Steps 1 and 2 are satisfied by the policy being in the vault.
  assert.equal(steps.find((s) => s.id === 'register')!.done, true);
  assert.equal(steps.find((s) => s.id === 'add')!.done, true);
  // So the curator is sent to the authorisation, not to the deposit.
  assert.equal(firstActionableStep(steps), 'authorize');
});

check('with policy and role, depositing is finally open', () => {
  const steps = deriveSetupSteps({ hasVaultPolicy: true, callerCanDeposit: true, premiumReceived: 0n });
  const premium = steps.find((s) => s.id === 'premium')!;
  assert.equal(premium.blockedReason, undefined);
  assert.equal(firstActionableStep(steps), 'premium');
});

check('once a premium is in, every step reads done', () => {
  const steps = deriveSetupSteps({
    hasVaultPolicy: true,
    callerCanDeposit: true,
    premiumReceived: 1_000_000n,
  });
  assert.ok(steps.every((s) => s.done));
  // Nothing left to do: the last step stays selected rather than looping back.
  assert.equal(firstActionableStep(steps), 'premium');
});

check('a blocked step is never also marked done', () => {
  for (const hasVaultPolicy of [false, true]) {
    for (const callerCanDeposit of [false, true]) {
      for (const premiumReceived of [0n, 5n]) {
        for (const s of deriveSetupSteps({ hasVaultPolicy, callerCanDeposit, premiumReceived })) {
          assert.ok(!(s.done && s.blockedReason), `${s.id} both done and blocked`);
        }
      }
    }
  }
});

console.log(`\n${checks} checks passed.`);
