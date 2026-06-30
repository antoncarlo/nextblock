import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';

/**
 * Reports whether the audit-trail backend is provisioned. The UI degrades to
 * unavailable when false (no service-role client / Supabase not reachable).
 * Same posture as the KYB / evidence / notification status endpoints.
 */
export async function GET() {
  return NextResponse.json({ available: getSupabaseServerClient() !== null });
}
