import { randomBytes } from 'crypto';

/**
 * SERVER-ONLY single-use nonce store for KYB operator actions.
 *
 * Replay model: an operator review signature binds action, application id,
 * target status, timestamp AND a server-issued nonce. The nonce is consumed
 * atomically on first successful verification, so a captured request cannot
 * be replayed even inside the timestamp window.
 *
 * Store characteristics: production routes may provide a Supabase-backed store
 * so issued nonces survive serverless instance boundaries. Local development
 * and smoke tests can omit the store and use the module-scoped fallback.
 *
 * Author: Anton Carlo Santoro
 */

const NONCE_TTL_MS = 300_000; // aligned with OPERATOR_AUTH_WINDOW_SECONDS

interface NonceEntry {
  expiresAt: number;
}

export interface IssuedNonce {
  nonce: string;
  expiresInSeconds: number;
}

export interface NonceStore {
  issue(address: string, nonce: string, expiresAt: Date): Promise<void>;
  consume(address: string, nonce: string, now: Date): Promise<boolean>;
}

type SupabaseError = { message?: string } | null;

type SupabaseMutationResult<T = unknown> = PromiseLike<{ data?: T | null; error: SupabaseError }>;

type SupabaseNonceFilterBuilder = {
  eq(column: string, value: unknown): SupabaseNonceFilterBuilder;
  is(column: string, value: unknown): SupabaseNonceFilterBuilder;
  gt(column: string, value: unknown): SupabaseNonceFilterBuilder;
  select(columns: string): {
    maybeSingle(): SupabaseMutationResult<{ nonce: string }>;
  };
};

type SupabaseNonceTable = {
  insert(values: Record<string, unknown>): SupabaseMutationResult;
  update(values: Record<string, unknown>): SupabaseNonceFilterBuilder;
};

type SupabaseLike = {
  from(table: string): SupabaseNonceTable;
};

const issued = new Map<string, NonceEntry>();

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function key(address: string, nonce: string): string {
  return `${normalizeAddress(address)}:${nonce}`;
}

function sweep(now: number): void {
  if (issued.size < 4096) return;
  for (const [k, entry] of issued) {
    if (entry.expiresAt <= now) issued.delete(k);
  }
}

function issueLocalNonce(address: string, nonce: string, expiresAt: number): void {
  sweep(Date.now());
  issued.set(key(address, nonce), { expiresAt });
}

function consumeLocalNonce(address: string, nonce: string): boolean {
  const k = key(address, nonce);
  const entry = issued.get(k);
  if (!entry) return false;
  issued.delete(k);
  return entry.expiresAt > Date.now();
}

export function createSupabaseNonceStore(supabase: SupabaseLike): NonceStore {
  return {
    async issue(address: string, nonce: string, expiresAt: Date): Promise<void> {
      const { error } = await supabase.from('kyb_operator_nonces').insert({
        operator_address: normalizeAddress(address),
        nonce,
        expires_at: expiresAt.toISOString(),
      });

      if (error) {
        throw new Error(`Unable to issue KYB nonce: ${error.message ?? String(error)}`);
      }
    },

    async consume(address: string, nonce: string, now: Date): Promise<boolean> {
      const { data, error } = await supabase
        .from('kyb_operator_nonces')
        .update({ consumed_at: now.toISOString() })
        .eq('operator_address', normalizeAddress(address))
        .eq('nonce', nonce)
        .is('consumed_at', null)
        .gt('expires_at', now.toISOString())
        .select('nonce')
        .maybeSingle();

      if (error) {
        throw new Error(`Unable to consume KYB nonce: ${error.message ?? String(error)}`);
      }

      return Boolean(data);
    },
  };
}

/** Issue a fresh single-use nonce bound to the operator address. */
export async function issueNonce(address: string, store?: NonceStore): Promise<IssuedNonce> {
  const now = Date.now();
  const nonce = randomBytes(16).toString('hex');
  const expiresAtMs = now + NONCE_TTL_MS;
  const expiresAt = new Date(expiresAtMs);

  if (store) {
    await store.issue(address, nonce, expiresAt);
  } else {
    issueLocalNonce(address, nonce, expiresAtMs);
  }

  return { nonce, expiresInSeconds: NONCE_TTL_MS / 1000 };
}

/**
 * Consume a nonce: returns true exactly once per issued (address, nonce)
 * pair, false for unknown, expired or already-used nonces.
 */
export async function consumeNonce(address: string, nonce: string, store?: NonceStore): Promise<boolean> {
  if (store) {
    return store.consume(address, nonce, new Date());
  }

  return consumeLocalNonce(address, nonce);
}
