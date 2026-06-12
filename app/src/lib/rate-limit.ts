import { NextRequest } from 'next/server';

/**
 * Minimal fixed-window, in-memory IP rate limiter for the KYB API surface.
 *
 * Scope and limits are deliberate: the store is module-scoped, so on
 * serverless platforms each warm instance enforces the limit independently
 * (best effort). That is acceptable for the current abuse model (low-volume
 * staging, single-operator review); a shared store (e.g. Upstash/KV) is the
 * upgrade path before high-traffic production.
 *
 * Author: Anton Carlo Santoro
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

// Opportunistic cleanup so the map cannot grow unbounded.
function sweep(now: number): void {
  if (windows.size < 1024) return;
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }
}

/** Client IP from proxy headers; Vercel sets x-forwarded-for. */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Consume one unit from the fixed window identified by `bucket` + ip.
 * Returns allowed=false when the limit is exhausted for the current window.
 */
export function rateLimit(
  bucket: string,
  ip: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const key = `${bucket}:${ip}`;
  const entry = windows.get(key);

  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
