import type { NextRequest } from 'next/server';

/**
 * Fixed-window IP rate limiter for the KYB API surface.
 *
 * Production routes may provide a Supabase-backed store so counters are shared
 * across serverless instances. Local development and tests can omit the store
 * and use the module-scoped in-memory fallback.
 *
 * Author: Anton Carlo Santoro
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimitStore {
  consume(bucket: string, subject: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

type SupabaseError = { message?: string } | null;

type SupabaseLike = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: SupabaseError }>;
};

const windows = new Map<string, WindowEntry>();

// Opportunistic cleanup so the map cannot grow unbounded.
function sweep(now: number): void {
  if (windows.size < 1024) return;
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }
}

function normalizeSubject(subject: string): string {
  return subject.trim().slice(0, 200) || 'unknown';
}

function normalizeBucket(bucket: string): string {
  return bucket.toLowerCase().replace(/[^a-z0-9:_-]/g, '-').slice(0, 80);
}

/** Client IP from proxy headers; Vercel sets x-forwarded-for. */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export function createSupabaseRateLimitStore(supabase: SupabaseLike): RateLimitStore {
  return {
    async consume(bucket: string, subject: string, limit: number, windowMs: number): Promise<RateLimitResult> {
      const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
      const { data, error } = await supabase.rpc('kyb_consume_rate_limit', {
        p_bucket: normalizeBucket(bucket),
        p_subject: normalizeSubject(subject),
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });

      if (error) {
        throw new Error(`Unable to consume KYB rate limit: ${error.message ?? String(error)}`);
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== 'object') {
        throw new Error('Unable to consume KYB rate limit: empty RPC response');
      }

      const result = row as {
        allowed?: boolean;
        retry_after_seconds?: number;
      };

      return {
        allowed: Boolean(result.allowed),
        retryAfterSeconds: Number(result.retry_after_seconds ?? 0),
      };
    },
  };
}

function rateLimitLocal(
  bucket: string,
  ip: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const key = `${normalizeBucket(bucket)}:${normalizeSubject(ip)}`;
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

/**
 * Consume one unit from the fixed window identified by `bucket` + ip.
 * Returns allowed=false when the limit is exhausted for the current window.
 */
export async function rateLimit(
  bucket: string,
  ip: string,
  limit: number,
  windowMs: number,
  store?: RateLimitStore,
): Promise<RateLimitResult> {
  if (store) {
    return store.consume(bucket, ip, limit, windowMs);
  }

  return rateLimitLocal(bucket, ip, limit, windowMs);
}
