import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { logApiError } from '@/lib/api-log';

/**
 * Minimal public status lookup for the apply page: given a wallet, returns
 * ONLY applicant type, status and timestamps. No PII (company, contacts,
 * documents) ever leaves this endpoint; full records are operator-only.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ available: false, applications: [] }, { status: 503 });
  }

  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'invalid wallet' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('kyb_applications')
    .select('applicant_type, status, created_at, updated_at')
    .ilike('wallet_address', wallet)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) {
    logApiError('kyb/applications/status', 'storage_error', { code: error.code });
    return NextResponse.json({ available: false, applications: [] }, { status: 502 });
  }

  return NextResponse.json({
    available: true,
    applications: (data ?? []).map(a => ({
      applicantType: a.applicant_type,
      status: a.status,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    })),
  });
}
