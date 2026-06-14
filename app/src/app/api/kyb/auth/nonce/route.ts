import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseNonceStore, issueNonce } from '@/lib/kyb/nonces';
import { clientIp, createSupabaseRateLimitStore, rateLimit } from '@/lib/rate-limit';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { logApiError } from '@/lib/api-log';

/**
 * Issues a single-use nonce for KYB operator actions.
 *
 * The nonce by itself grants nothing: it only becomes meaningful inside an
 * EIP-191 message signed by a wallet that passes the server-side on-chain
 * role check. Issuance is rate limited to keep the store bounded.
 */

const nonceRequestSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'invalid EVM address'),
});

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  const rateLimitStore = supabase ? createSupabaseRateLimitStore(supabase) : undefined;
  const nonceStore = supabase ? createSupabaseNonceStore(supabase) : undefined;

  try {
    const limited = await rateLimit('kyb-nonce', clientIp(request), 30, 10 * 60 * 1000, rateLimitStore);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: 'too many requests' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
      );
    }
  } catch (error) {
    logApiError('kyb/nonce', 'rate_limit_storage_error', { code: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'storage error' }, { status: 502 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = nonceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation failed' }, { status: 400 });
  }

  try {
    const { nonce, expiresInSeconds } = await issueNonce(parsed.data.address, nonceStore);
    return NextResponse.json({ nonce, expiresInSeconds });
  } catch (error) {
    logApiError('kyb/nonce', 'nonce_storage_error', { code: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'storage error' }, { status: 502 });
  }
}
