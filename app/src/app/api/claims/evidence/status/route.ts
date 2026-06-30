import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';

/**
 * Reports whether the evidence backend is provisioned (service-role client +
 * Supabase reachable). The UI degrades to "unavailable" when false, instead of
 * inventing state — same posture as the KYB status endpoint.
 */
export async function GET() {
  return NextResponse.json({ available: getSupabaseServerClient() !== null });
}
