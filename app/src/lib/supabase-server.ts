import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * SERVER-ONLY Supabase client (service role).
 *
 * Must be imported exclusively from Route Handlers / server code: the service
 * role bypasses RLS. Importing this from a client component would leak the
 * key into the bundle; the env var has no NEXT_PUBLIC_ prefix precisely so
 * Next.js never inlines it client-side.
 *
 * Fail-closed: when SUPABASE_SERVICE_ROLE_KEY (or the URL) is missing, the
 * accessor returns null and callers must respond 503 "unavailable" instead of
 * inventing state. No fallback values exist for the service key by design.
 *
 * NOTE: typed as SupabaseClient without the generated Database schema because
 * the KYB tables only exist after the 0001 migration is applied (pending
 * owner authorization); types will be regenerated at that point.
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * SERVER-SIDE anon Supabase client for validating user bearer tokens through
 * Supabase Auth. It never bypasses RLS and does not expose service-role power.
 * Accepts both the newer PUBLISHABLE_KEY name and the legacy ANON_KEY name used
 * by the browser client in this repository.
 */
export function getSupabaseAnonServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
