/**
 * Wallet sanctions provider smoke (Batch F).
 *
 *   node --experimental-strip-types app/scripts/wallet-sanctions-smoke.ts
 *
 * Scope: the dev fixture's determinism, the Chainalysis-oracle provider against an injected
 * RPC (sanctioned / clear / every way the read can fail), and provider selection. No network.
 */

import {
  MockWalletScreeningProvider,
  ChainalysisOracleProvider,
  CHAINALYSIS_ORACLE_BASE,
  getWalletScreeningProvider,
} from '../src/lib/sanctions/wallet-provider.ts';
import { MockProviderForbiddenError } from '../src/lib/providers/production.ts';

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

// The Chainalysis oracle provider, against an injected JSON-RPC endpoint.
const SANCTIONED = '0x098b716b8aaf21512996dc57eb0615e2383e2f96' as const;
const rpcAnswer = (result: string, status = 200) => async () =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status });
const YES = '0x' + '0'.repeat(63) + '1';
const NO = '0x' + '0'.repeat(64);

{
  let seen = null as { url: string; body: { method: string; params: Array<{ to: string; data: string } | string> } } | null;
  const capture = async (url: unknown, init?: RequestInit) => {
    seen = { url: String(url), body: JSON.parse(String(init?.body)) };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: YES }));
  };
  const p = new ChainalysisOracleProvider({ fetchImpl: capture as typeof fetch });
  const r = await p.screen({ address: SANCTIONED });
  check('oracle: sanctioned -> match', r.resultCode === 'match');
  check('oracle: match is high severity, score 1', r.matches[0]?.severity === 'high' && r.matches[0]?.score === 1);
  check('oracle: category names the finding', r.matches[0]?.category === 'sanctioned-address');
  check('oracle: provider name', r.provider === 'chainalysis-oracle');
  check('oracle: result states what it does not cover', String(r.rawResponse?.coverage).includes('Not covered'));
  const call = (seen as typeof seen)?.body.params[0] as { to: string; data: string };
  check('oracle: eth_call to the Base oracle', (seen as typeof seen)?.body.method === 'eth_call' && call.to === CHAINALYSIS_ORACLE_BASE);
  check('oracle: calldata is isSanctioned(address) with the screened address',
    call.data.startsWith('0xdf592f7d') && call.data.endsWith(SANCTIONED.slice(2)));
  check('oracle: reads Base mainnet by default', (seen as typeof seen)?.url === 'https://mainnet.base.org');
}
{
  const r = await new ChainalysisOracleProvider({ fetchImpl: rpcAnswer(NO) as typeof fetch }).screen({
    address: '0x1111111111111111111111111111111111111111',
  });
  check('oracle: not sanctioned -> clear', r.resultCode === 'clear' && r.matches.length === 0);
}
// Every way the read can fail is an error, never clear.
{
  const addr = { address: '0x1111111111111111111111111111111111111111' as const };
  const code = async (f: typeof fetch, timeoutMs?: number) =>
    (await new ChainalysisOracleProvider({ fetchImpl: f, timeoutMs }).screen(addr)).resultCode;
  check('oracle: HTTP 500 -> error', (await code(rpcAnswer(NO, 500) as typeof fetch)) === 'error');
  check('oracle: JSON-RPC error -> error', (await code((async () =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'rate limited' } }))) as typeof fetch)) === 'error');
  check('oracle: empty result -> error', (await code(rpcAnswer('0x') as typeof fetch)) === 'error');
  check('oracle: non-boolean word -> error', (await code(rpcAnswer('0x' + '0'.repeat(63) + '2') as typeof fetch)) === 'error');
  check('oracle: network failure -> error', (await code((async () => { throw new TypeError('fetch failed'); }) as typeof fetch)) === 'error');
  check('oracle: body that is not JSON -> error', (await code((async () => new Response('<html>')) as typeof fetch)) === 'error');
  const hang = ((_u: unknown, init?: RequestInit) =>
    new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
  check('oracle: timeout -> error', (await code(hang, 40)) === 'error');
}

// Factory env-driven selection.
{
  check('dev default = mock', getWalletScreeningProvider({}).name === 'mock');
  check('dev explicit mock', getWalletScreeningProvider({ WALLET_SCREENING_PROVIDER: 'mock' }).name === 'mock');
  check('oracle selectable anywhere', getWalletScreeningProvider({ WALLET_SCREENING_PROVIDER: 'chainalysis-oracle' }).name === 'chainalysis-oracle');
  check('production default = the real oracle', getWalletScreeningProvider({ VERCEL_ENV: 'production' }).name === 'chainalysis-oracle');
  let forbidden = false;
  try {
    getWalletScreeningProvider({ VERCEL_ENV: 'production', WALLET_SCREENING_PROVIDER: 'mock' });
  } catch (e) {
    forbidden = e instanceof MockProviderForbiddenError;
  }
  check('production refuses the mock', forbidden);
  let unknown = false;
  try {
    getWalletScreeningProvider({ WALLET_SCREENING_PROVIDER: 'chainalysis' });
  } catch {
    unknown = true;
  }
  check('a removed or unknown provider name fails loud', unknown);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
