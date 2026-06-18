import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';

/**
 * Reports whether the notification backend is provisioned (service-role client
 * + Supabase reachable). The bell degrades to unavailable when false; same
 * posture as KYB and evidence status endpoints.
 */
export async function GET() {
  return NextResponse.json({ available: getSupabaseServerClient() !== null });
}
