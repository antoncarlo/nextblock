import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { createSupabaseRateLimitStore, rateLimit } from '@/lib/rate-limit';
import { logApiError } from '@/lib/api-log';

/**
 * Internal analytics — page-view ingestion.
 *
 * Fed fire-and-forget by the edge middleware; every response is intentionally
 * cheap and non-committal (the caller never reads it). Rate limit: 1 insert
 * per 2 seconds per session (shared Supabase window store), so reloads/bursts
 * cannot flood the table. Fail-closed: without the service-role backend the
 * route no-ops — tracking must never take the site down.
 */

const payloadSchema = z.object({
  ip: z.string().max(64).nullish(),
  country: z.string().max(8).nullish(),
  city: z.string().max(128).nullish(),
  region: z.string().max(64).nullish(),
  referrer: z.string().max(2048).nullish(),
  userAgent: z.string().max(512).nullish(),
  path: z.string().min(1).max(512),
  sessionId: z.string().regex(/^[0-9a-f-]{16,64}$/),
  ts: z.string().datetime().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return new NextResponse(null, { status: 204 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'validation failed' }, { status: 400 });
  const p = parsed.data;

  try {
    const limited = await rateLimit(
      'track-pageview',
      p.sessionId,
      1,
      2_000,
      createSupabaseRateLimitStore(supabase),
    );
    if (!limited.allowed) return new NextResponse(null, { status: 204 });
  } catch {
    // Rate-limit storage hiccup: drop the sample rather than fail loudly —
    // analytics ingestion must stay harmless.
    return new NextResponse(null, { status: 204 });
  }

  const { error } = await supabase.from('site_visits').insert({
    ip: p.ip ?? null,
    country: p.country ?? null,
    city: p.city ? decodeURIComponent(p.city) : null, // Vercel URL-encodes city names
    region: p.region ?? null,
    referrer: p.referrer ?? null,
    user_agent: p.userAgent ?? null,
    path: p.path,
    session_id: p.sessionId,
    ...(p.ts ? { created_at: p.ts } : {}),
  });
  if (error) logApiError('track/pageview', 'insert_failed', { code: error.code ?? 'unknown' });

  return new NextResponse(null, { status: 204 });
}
