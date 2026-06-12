import { randomBytes } from 'crypto';

/**
 * SERVER-ONLY single-use nonce store for KYB operator actions.
 *
 * Replay model: an operator review signature binds action, application id,
 * target status, timestamp AND a server-issued nonce. The nonce is consumed
 * atomically on first successful verification, so a captured request cannot
 * be replayed even inside the timestamp window.
 *
 * Store characteristics (deliberate): module-scoped in-memory map. On
 * serverless platforms each warm instance has its own store, which is
 * FAIL-CLOSED across instances: a nonce issued by instance A is unknown to
 * instance B, so B rejects and the operator retries with a fresh nonce.
 * Replay protection therefore never weakens; at worst a legitimate retry is
 * needed. A Supabase-backed nonce table (migration 0002) is the durable
 * upgrade path and requires a separately authorized migration.
 *
 * Author: Anton Carlo Santoro
 */

const NONCE_TTL_MS = 300_000; // aligned with OPERATOR_AUTH_WINDOW_SECONDS

interface NonceEntry {
  expiresAt: number;
}

const issued = new Map<string, NonceEntry>();

function key(address: string, nonce: string): string {
  return `${address.toLowerCase()}:${nonce}`;
}

function sweep(now: number): void {
  if (issued.size < 4096) return;
  for (const [k, entry] of issued) {
    if (entry.expiresAt <= now) issued.delete(k);
  }
}

/** Issue a fresh single-use nonce bound to the operator address. */
export function issueNonce(address: string): {
  nonce: string;
  expiresInSeconds: number;
} {
  const now = Date.now();
  sweep(now);
  const nonce = randomBytes(16).toString('hex');
  issued.set(key(address, nonce), { expiresAt: now + NONCE_TTL_MS });
  return { nonce, expiresInSeconds: NONCE_TTL_MS / 1000 };
}

/**
 * Consume a nonce: returns true exactly once per issued (address, nonce)
 * pair, false for unknown, expired or already-used nonces.
 */
export function consumeNonce(address: string, nonce: string): boolean {
  const k = key(address, nonce);
  const entry = issued.get(k);
  if (!entry) return false;
  issued.delete(k);
  return entry.expiresAt > Date.now();
}
