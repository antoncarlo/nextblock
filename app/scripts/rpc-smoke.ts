/**
 * Server RPC resilience smoke (no external network).
 *
 *   node --experimental-strip-types app/scripts/rpc-smoke.ts
 *
 * The server reads the chain through a configured provider endpoint and falls back to
 * the public one. Provider endpoints embed their API key in the URL, and viem puts the
 * URL in its error messages, so nothing built from an RPC failure may ever carry the
 * message. This drives the real transport and probe against local JSON-RPC servers:
 * one that answers, one that is over quota (HTTP 429), one that is down.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPublicClient } from 'viem';
import { baseSepolia } from 'viem/chains';
import { describeRpcFailure, probeRpc, rpcTransport } from '../src/lib/server/chain-client.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const KEY = 'SECRETKEY0123456789abcdef';
type Mode = 'ok' | 'quota' | 'down' | 'slow';

async function start(mode: Mode): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (mode === 'quota') {
        res.statusCode = 429;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ code: 429, message: 'Monthly capacity limit exceeded.' }));
        return;
      }
      if (mode === 'down') {
        req.socket.destroy();
        return;
      }
      const send = () => {
        const id = (JSON.parse(body || '{}') as { id?: number }).id ?? 1;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result: '0x2d70e17' }));
      };
      if (mode === 'slow') setTimeout(send, 600);
      else send();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v2/${KEY}` };
}

const ok = await start('ok');
const ok2 = await start('ok');
const quota = await start('quota');
const down = await start('down');
const slow = await start('slow');

// ── describing a failure ─────────────────────────────────────────────────────
{
  const viemLike = Object.assign(new Error(`HTTP request failed.\n\nURL: https://base-sepolia.g.alchemy.com/v2/${KEY}\nRequest body: {}`), {
    name: 'HttpRequestError',
    status: 429,
  });
  const d = describeRpcFailure(viemLike);
  check('describe: 429 is named as a quota problem', d.includes('429'));
  check('describe: the message, URL and key never appear', !d.includes('alchemy') && !d.includes(KEY) && !d.includes('http'));
  check('describe: a timeout', describeRpcFailure(Object.assign(new Error('The request took too long to respond.'), { name: 'TimeoutError' })) === 'timed out');
  check('describe: a plain HTTP status', describeRpcFailure(Object.assign(new Error('x'), { name: 'HttpRequestError', status: 503 })) === 'HTTP 503');
  check('describe: an unhealthy upstream', describeRpcFailure(new Error('no backend is currently healthy to serve traffic')) === 'upstream unhealthy');
  check('describe: anything else is just unreachable', describeRpcFailure(new Error(`fetch failed ${KEY}`)) === 'unreachable');
  check('describe: not an Error at all', describeRpcFailure(undefined) === 'unreachable');
}

// ── the probe ────────────────────────────────────────────────────────────────
{
  const p = await probeRpc({ primary: ok.url, fallbackUrl: ok2.url });
  check('probe: configured endpoint up -> ok, no message', p.ok && p.error === null);

  const q = await probeRpc({ primary: quota.url, fallbackUrl: ok2.url });
  check('probe: over quota but fallback up -> still ok', q.ok === true);
  check('probe: ...and says the configured endpoint is failing (429)', (q.error ?? '').includes('429') && (q.error ?? '').includes('advisory'));
  check('probe: ...naming hosts only, never the path or key', !JSON.stringify(q).includes(KEY) && !JSON.stringify(q).includes('/v2/'));

  const both = await probeRpc({ primary: quota.url, fallbackUrl: down.url });
  check('probe: both failing -> not ok', both.ok === false);
  check('probe: ...with a safe description of both', (both.error ?? '').includes('429') && !JSON.stringify(both).includes(KEY));

  const alone = await probeRpc({ primary: down.url, fallbackUrl: down.url });
  check('probe: single public endpoint down -> not ok, no fallback claimed', alone.ok === false && !(alone.error ?? '').includes('fallback'));

  const t = await probeRpc({ primary: slow.url, fallbackUrl: ok2.url, timeoutMs: 100 });
  check('probe: a slow primary times out and the fallback serves', t.ok === true && (t.error ?? '').includes('timed out'));
}

// ── the transport the routes read through ────────────────────────────────────
{
  const client = createPublicClient({ chain: baseSepolia, transport: rpcTransport({ primary: quota.url, fallbackUrl: ok2.url }) });
  const block = await client.getBlockNumber();
  check('transport: a read survives the configured endpoint being over quota', block === 0x2d70e17n);

  const direct = createPublicClient({ chain: baseSepolia, transport: rpcTransport({ primary: ok.url, fallbackUrl: down.url }) });
  check('transport: healthy primary needs no fallback', (await direct.getBlockNumber()) === 0x2d70e17n);

  const same = createPublicClient({ chain: baseSepolia, transport: rpcTransport({ primary: ok.url, fallbackUrl: ok.url }) });
  check('transport: primary equal to the fallback is a single endpoint', (await same.getBlockNumber()) === 0x2d70e17n);

  let threw = false;
  let leaked = false;
  try {
    await createPublicClient({ chain: baseSepolia, transport: rpcTransport({ primary: quota.url, fallbackUrl: down.url }) }).getBlockNumber();
  } catch (e) {
    threw = true;
    leaked = describeRpcFailure(e).includes(KEY);
  }
  check('transport: both down -> the read fails, and what we would report holds no key', threw && !leaked);
}

for (const s of [ok, ok2, quota, down, slow]) s.server.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
