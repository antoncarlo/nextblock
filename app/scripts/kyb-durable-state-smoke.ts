/*
 * KYB durable-state smoke checks.
 *
 * Runs with Node 22 TypeScript strip-types loader, without adding a test
 * framework or repository dependency:
 *
 *   node --experimental-strip-types scripts/kyb-durable-state-smoke.ts
 *
 * Scope: verifies the TypeScript contract for Supabase-backed nonce and
 * rate-limit stores plus the local in-memory fallback used for development
 * without Supabase configuration. No remote Supabase project is contacted.
 *
 * Author: Anton Carlo Santoro
 */

import {
  consumeNonce,
  createSupabaseNonceStore,
  issueNonce,
} from '../src/lib/kyb/nonces.ts';
import {
  createSupabaseRateLimitStore,
  rateLimit,
} from '../src/lib/rate-limit.ts';

let failures = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const operatorAddress = '0x8Fd8b45Ba2612E7535bbeB21615554701CfaF870';

const nonceTables: string[] = [];
const nonceFilters: Array<{ op: string; column: string; value: unknown }> = [];
let nonceInsertPayload: unknown;
let nonceUpdatePayload: unknown;
let consumeShouldReturnRow = true;

class FakeNonceQuery {
  readonly table: string;

  constructor(table: string) {
    this.table = table;
  }

  async insert(payload: unknown) {
    nonceInsertPayload = payload;
    return { error: null };
  }

  update(payload: unknown) {
    nonceUpdatePayload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    nonceFilters.push({ op: 'eq', column, value });
    return this;
  }

  is(column: string, value: unknown) {
    nonceFilters.push({ op: 'is', column, value });
    return this;
  }

  gt(column: string, value: unknown) {
    nonceFilters.push({ op: 'gt', column, value });
    return this;
  }

  select() {
    return this;
  }

  async maybeSingle() {
    return { data: consumeShouldReturnRow ? { nonce: 'abc123' } : null, error: null };
  }
}

const fakeNonceSupabase = {
  from(table: string) {
    nonceTables.push(table);
    return new FakeNonceQuery(table);
  },
};

const nonceStore = createSupabaseNonceStore(fakeNonceSupabase);
const issued = await issueNonce(operatorAddress, nonceStore);
check('nonce durevole emesso in formato esadecimale a 128 bit', /^[0-9a-f]{32}$/.test(issued.nonce));
check('nonce store usa tabella kyb_operator_nonces', nonceTables.includes('kyb_operator_nonces'));
check('nonce store inserisce operator_address normalizzato', JSON.stringify(nonceInsertPayload).includes(operatorAddress.toLowerCase()));
check('nonce store inserisce expires_at', JSON.stringify(nonceInsertPayload).includes('expires_at'));

const firstConsume = await consumeNonce(operatorAddress, 'abc123', nonceStore);
consumeShouldReturnRow = false;
const secondConsume = await consumeNonce(operatorAddress, 'abc123', nonceStore);
check('consume durevole accetta la prima riga aggiornata', firstConsume);
check('consume durevole rifiuta replay senza riga aggiornata', !secondConsume);
check('consume durevole filtra consumed_at null', nonceFilters.some(f => f.op === 'is' && f.column === 'consumed_at' && f.value === null));
check('consume durevole filtra expires_at futura', nonceFilters.some(f => f.op === 'gt' && f.column === 'expires_at'));
check('consume durevole marca consumed_at', JSON.stringify(nonceUpdatePayload).includes('consumed_at'));

const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const fakeRateLimitSupabase = {
  async rpc(name: string, args: Record<string, unknown>) {
    rpcCalls.push({ name, args });
    return {
      data: [{ allowed: true, retry_after_seconds: 0, current_count: 1, reset_at: new Date().toISOString() }],
      error: null,
    };
  },
};

const durableRateLimit = await rateLimit(
  'kyb-review',
  '203.0.113.10',
  30,
  10 * 60 * 1000,
  createSupabaseRateLimitStore(fakeRateLimitSupabase),
);
check('rate-limit durevole consente risposta RPC allowed=true', durableRateLimit.allowed);
check('rate-limit durevole usa RPC kyb_consume_rate_limit', rpcCalls[0]?.name === 'kyb_consume_rate_limit');
check('rate-limit durevole passa finestra in secondi', rpcCalls[0]?.args.p_window_seconds === 600);
check('rate-limit durevole passa limit configurato', rpcCalls[0]?.args.p_limit === 30);

const localNonce = await issueNonce(operatorAddress);
check('fallback locale consuma il nonce una volta', await consumeNonce(operatorAddress, localNonce.nonce));
check('fallback locale rifiuta replay', !(await consumeNonce(operatorAddress, localNonce.nonce)));

const localRate1 = await rateLimit('kyb-smoke', '198.51.100.7', 1, 60_000);
const localRate2 = await rateLimit('kyb-smoke', '198.51.100.7', 1, 60_000);
check('fallback locale consente prima richiesta', localRate1.allowed);
check('fallback locale limita seconda richiesta', !localRate2.allowed && localRate2.retryAfterSeconds > 0);

if (failures > 0) {
  console.error(`\n${failures} CHECK FALLITI`);
  process.exit(1);
}
console.log('\nTUTTI I CHECK KYB DURABLE STATE PASSATI');
