import { verifyMessage } from 'viem';
import { operatorAuthMessage, isTimestampWithinWindow } from '@/lib/kyb/schema';

/**
 * SERVER-ONLY notification auth.
 *
 *   verifyOwnerSignature — caller signed a message naming an action; we only
 *   check the signature is valid and recent. Used to read/mark-as-read the
 *   caller's own notifications (the recipient_addr filter on the query is the
 *   true authorization gate — the signature proves the caller controls that
 *   address).
 *
 *   verifyCronSecret — used by the Vercel Cron job to call the refresh route
 *   without a wallet. Compares a constant-time header against `CRON_SECRET`.
 *   Fail-closed when unset.
 */

export interface NotificationAuthInput {
  address: `0x${string}`;
  timestamp: number;
  signature: `0x${string}`;
  nonce?: string;
}

export type NotificationAuthResult =
  | { ok: true; address: `0x${string}` }
  | { ok: false; status: 401; error: string };

export async function verifyOwnerSignature(
  action: string,
  auth: NotificationAuthInput,
): Promise<NotificationAuthResult> {
  if (!isTimestampWithinWindow(auth.timestamp, Math.floor(Date.now() / 1000))) {
    return { ok: false, status: 401, error: 'expired signature' };
  }
  try {
    const ok = await verifyMessage({
      address: auth.address,
      message: operatorAuthMessage(action, auth.timestamp, auth.nonce),
      signature: auth.signature,
    });
    if (!ok) return { ok: false, status: 401, error: 'invalid signature' };
  } catch {
    return { ok: false, status: 401, error: 'invalid signature' };
  }
  return { ok: true, address: auth.address };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i += 1) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function verifyCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (!authHeader) return false;
  const m = /^Bearer\s+(.+)$/.exec(authHeader);
  if (!m) return false;
  return timingSafeEqual(m[1], secret);
}
