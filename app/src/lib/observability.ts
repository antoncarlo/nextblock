/**
 * Lightweight observability helpers (Batch J).
 *
 * Two design choices kept deliberately small:
 *  1. **No SDK dependency** — Sentry / Datadog / etc require an account and
 *     onboarding that the pilot doesn't have yet. Instead we emit structured
 *     JSON lines that Vercel log search can filter on; when a real APM lands
 *     we replace the sink and keep the call sites unchanged.
 *  2. **PII-free** — no wallet addresses, no email, no raw bodies. The
 *     request id is derived from the headers Vercel already attaches, so we
 *     don't generate new identifiers we'd have to think about.
 *
 * Call sites:
 *   logApiInfo / logApiWarn / logApiError — for explicit events
 *   withRequestLogging(handler) — wraps a Next.js route handler to emit
 *     request start + outcome with duration + status; never throws into the
 *     handler.
 */

import { NextRequest, NextResponse } from 'next/server';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogDetail {
  code?: string | number | null;
  /** Optional context — never include PII. Stay structural. */
  context?: Record<string, string | number | boolean | null>;
}

function emit(level: LogLevel, route: string, kind: string, detail?: LogDetail) {
  const payload = {
    level,
    route,
    kind,
    code: detail?.code ?? null,
    ctx: detail?.context ?? undefined,
    at: new Date().toISOString(),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function logApiInfo(route: string, kind: string, detail?: LogDetail): void {
  emit('info', route, kind, detail);
}
export function logApiWarn(route: string, kind: string, detail?: LogDetail): void {
  emit('warn', route, kind, detail);
}
export function logApiError(route: string, kind: string, detail?: LogDetail): void {
  emit('error', route, kind, detail);
}

/** Pull the Vercel-issued correlation id, or fall back to nothing. */
export function getRequestId(request: Request | NextRequest): string | null {
  return request.headers.get('x-vercel-id') ?? request.headers.get('x-request-id') ?? null;
}

/**
 * Wrap a Next.js route handler so every invocation emits a start + outcome
 * structured log with the request id, method, route, status, and duration.
 * The wrapped handler never sees a swallowed error — exceptions propagate
 * exactly as before so existing error paths keep working.
 */
export function withRequestLogging<Ctx>(
  route: string,
  handler: (req: NextRequest, ctx: Ctx) => Promise<NextResponse> | NextResponse,
): (req: NextRequest, ctx: Ctx) => Promise<NextResponse> {
  return async (req, ctx) => {
    const start = performance.now();
    const reqId = getRequestId(req);
    const method = req.method;
    logApiInfo(route, 'request_start', { context: { reqId: reqId ?? 'none', method } });
    try {
      const res = await handler(req, ctx);
      const ms = Math.round(performance.now() - start);
      const level: LogLevel = res.status >= 500 ? 'error' : res.status >= 400 ? 'warn' : 'info';
      emit(level, route, 'request_end', {
        context: { reqId: reqId ?? 'none', method, status: res.status, ms },
      });
      return res;
    } catch (err) {
      const ms = Math.round(performance.now() - start);
      logApiError(route, 'request_threw', {
        code: err instanceof Error ? err.name : 'unknown',
        context: { reqId: reqId ?? 'none', method, ms },
      });
      throw err;
    }
  };
}
