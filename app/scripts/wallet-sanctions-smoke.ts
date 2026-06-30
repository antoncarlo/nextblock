/**
 * Wallet sanctions provider smoke (Batch F).
 *
 *   node --experimental-strip-types app/scripts/wallet-sanctions-smoke.ts
 *
 * Scope: Mock determinism + stub fail-loud. No network.
 */

import {
  MockWalletScreeningProvider,
  ChainalysisKYTStub,
  TRMLabsStub,
  getWalletScreeningProvider,
} from '../src/lib/sanctions/wallet-provider.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const mock = new MockWalletScreeningProvider();

// Clean address.
{
  const r = await mock.screen({ address: '0x1111111111111111111111111111111111111111' });
  check('mock clean: clear', r.resultCode === 'clear');
  check('mock clean: 0 matches', r.matches.length === 0);
}

// OFAC magic substring.
{
  const r = await mock.screen({ address: '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead' });
  check('mock dead: match', r.resultCode === 'match');
  check('mock dead: OFAC-SDN category', r.matches[0]?.category === 'OFAC-SDN');
  check('mock dead: severity high', r.matches[0]?.severity === 'high');
}

// Mixer magic substring.
{
  const r = await mock.screen({ address: '0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef' });
  check('mock beef: match', r.resultCode === 'match');
  check('mock beef: mixer category', r.matches[0]?.category === 'mixer');
  check('mock beef: severity medium', r.matches[0]?.severity === 'medium');
}

// Stubs throw fail-loud.
{
  let threwChainalysis = false;
  try {
    await new ChainalysisKYTStub().screen({ address: '0x' + '0'.repeat(40) as `0x${string}` });
  } catch {
    threwChainalysis = true;
  }
  check('chainalysis stub throws', threwChainalysis);

  let threwTrm = false;
  try {
    await new TRMLabsStub().screen({ address: '0x' + '0'.repeat(40) as `0x${string}` });
  } catch {
    threwTrm = true;
  }
  check('trm stub throws', threwTrm);
}

// Factory env-driven selection.
{
  const defaultProvider = getWalletScreeningProvider({} as NodeJS.ProcessEnv);
  check('default = mock', defaultProvider.name === 'mock');

  const explicitMock = getWalletScreeningProvider({ WALLET_SCREENING_PROVIDER: 'mock' } as unknown as NodeJS.ProcessEnv);
  check('explicit mock', explicitMock.name === 'mock');

  let threwOnChainalysisNoKey = false;
  try {
    getWalletScreeningProvider({ WALLET_SCREENING_PROVIDER: 'chainalysis' } as unknown as NodeJS.ProcessEnv);
  } catch {
    threwOnChainalysisNoKey = true;
  }
  check('chainalysis without key throws (fail-loud)', threwOnChainalysisNoKey);

  const chainalysisWithKey = getWalletScreeningProvider({
    WALLET_SCREENING_PROVIDER: 'chainalysis',
    WALLET_SCREENING_API_KEY: 'fake',
  } as unknown as NodeJS.ProcessEnv);
  check('chainalysis with key returns stub', chainalysisWithKey.name === 'chainalysis');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
