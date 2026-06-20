import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';

/**
 * Reports whether the bordereau backend is provisioned.
 * Same posture as KYB / evidence / notifications status endpoints.
 */
export async function GET() {
  return NextResponse.json({ available: getSupabaseServerClient() !== null });
}
