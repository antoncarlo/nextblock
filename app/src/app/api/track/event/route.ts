import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { createSupabaseRateLimitStore, rateLimit } from '@/lib/rate-limit';
import { logApiError } from '@/lib/api-log';

/**
 * Internal analytics — behavioral events ingestion (click / section_time /
 * scroll), fed by TrackerScript via navigator.sendBeacon.
 *
 * The session id is NOT taken from the payload: it is re-read server-side
 * from the same httpOnly cookie the middleware manages (sendBeacon sends
 * same-origin cookies), so the cookie can stay httpOnly and the client can
 * never spoof another visitor's session.
 *
 * sendBeacon may deliver the JSON as text/plain — parse from raw text.
 * Rate limit: 30 events / 10 s per session. Fail-closed no-ops like pageview.
 */

const SESSION_COOKIE = 'nb_sid';

const eventSchema = z.object({
  path: z.string().min(1).max(512),
  eventType: z.enum(['click', 'section_time', 'scroll']),
  section: z.string().max(128).nullish(),
  elementText: z.string().max(160).nullish(),
  valueNumeric: z.number().finite().min(0).max(86_400).nullish(),
});

// A single beacon may batch several events (flush on pagehide).
const bodySchema = z.union([eventSchema, z.array(eventSchema).min(1).max(20)]);

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return new NextResponse(null, { status: 204 });

  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId || !/^[0-9a-f-]{16,64}$/.test(sessionId)) {
    return NextResponse.json({ error: 'no session' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'validation failed' }, { status: 400 });
  const events = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

  try {
    const limited = await rateLimit(
      'track-event',
      sessionId,
      30,
      10_000,
      createSupabaseRateLimitStore(supabase),
    );
    if (!limited.allowed) return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  // Geo from the beacon request itself (it rides through Vercel like any
  // request) — "where do people click from" without a session join.
  const country = request.headers.get('x-vercel-ip-country');
  const city = request.headers.get('x-vercel-ip-city');

  const rows = events.map((e) => ({
    session_id: sessionId,
    path: e.path,
    country: country ?? null,
    city: city ? decodeURIComponent(city) : null,
    event_type: e.eventType,
    section: e.section ?? null,
    element_text: e.elementText ?? null,
    value_numeric: e.valueNumeric ?? null,
  }));

  const { error } = await supabase.from('site_events').insert(rows);
  if (error) logApiError('track/event', 'insert_failed', { code: error.code ?? 'unknown' });

  return new NextResponse(null, { status: 204 });
}
