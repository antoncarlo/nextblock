import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { issueNonce } from '@/lib/kyb/nonces';
import { clientIp, rateLimit } from '@/lib/rate-limit';

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
  const limited = rateLimit('kyb-nonce', clientIp(request), 30, 10 * 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: 'too many requests' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    );
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

  const { nonce, expiresInSeconds } = issueNonce(parsed.data.address);
  return NextResponse.json({ nonce, expiresInSeconds });
}
