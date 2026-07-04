import { NextRequest, NextResponse, NextFetchEvent } from 'next/server';

/**
 * Internal analytics — page-view capture (request level).
 *
 * Runs only on public PAGE requests (the matcher excludes /api, /_next,
 * /admin and any static file). Extraction is non-blocking: the visit payload
 * is POSTed fire-and-forget to /api/track/pageview via event.waitUntil, so a
 * slow or unavailable tracking backend can never delay navigation.
 *
 * The session id lives in an httpOnly cookie (rolling 30-minute window —
 * classic web-analytics session semantics). Client-side behavioral events
 * (see TrackerScript) never read it: /api/track/event re-reads the cookie
 * server-side, so it can stay httpOnly.
 */

const SESSION_COOKIE = 'nb_sid';
const SESSION_MAX_AGE_SEC = 30 * 60; // rolling 30-minute session window

export function middleware(request: NextRequest, event: NextFetchEvent) {
  // Only count real document loads: RSC payloads, prefetches and asset
  // fetches would otherwise double-count every soft navigation.
  const dest = request.headers.get('sec-fetch-dest');
  const isDocument = dest ? dest === 'document' : (request.headers.get('accept') ?? '').includes('text/html');

  const response = NextResponse.next();

  let sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const isValidSid = !!sessionId && /^[0-9a-f-]{16,64}$/.test(sessionId);
  if (!isValidSid) sessionId = crypto.randomUUID();
  // (Re)set on every page hit: rolling expiry keeps the session alive while
  // the visitor keeps browsing and rotates naturally after 30 idle minutes.
  response.cookies.set(SESSION_COOKIE, sessionId!, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
  });

  if (isDocument) {
    const payload = {
      ip: (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || null,
      country: request.headers.get('x-vercel-ip-country'),
      city: request.headers.get('x-vercel-ip-city'),
      region: request.headers.get('x-vercel-ip-country-region'),
      referrer: request.headers.get('referer'),
      userAgent: request.headers.get('user-agent'),
      path: request.nextUrl.pathname,
      sessionId,
      // Explicit UTC instant of the request (the DB default would also do).
      ts: new Date().toISOString(),
    };

    // Fire-and-forget: never await in the request path, never throw.
    event.waitUntil(
      fetch(`${request.nextUrl.origin}/api/track/pageview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {}),
    );
  }

  return response;
}

export const config = {
  // Public pages only: skip API routes, Next internals, the private admin
  // dashboard and anything that looks like a static file (has an extension).
  matcher: ['/((?!api|_next|admin|.*\\..*).*)'],
};
