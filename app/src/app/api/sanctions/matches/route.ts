import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyClaimReviewer, type EvidenceAuthInput } from '@/lib/evidence/auth';
import { logApiError } from '@/lib/api-log';

/**
 * List sanctions matches. Defaults to `status=pending_sentinel` (the
 * Sentinel work-queue). Auth: same reviewer signature as the rest of the
 * regulated surfaces — must hold CLAIMS_COMMITTEE / SENTINEL / OWNER on-chain.
 *
 * (We deliberately reuse `verifyClaimReviewer`: the Sentinel role is the
 * same on-chain role that disputes claims and freezes accounts, so reusing
 * the role check keeps the operational surface coherent.)
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const sp = request.nextUrl.searchParams;
  const address = sp.get('address');
  const timestamp = sp.get('timestamp');
  const signature = sp.get('signature');
  if (!address || !timestamp || !signature || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'missing auth params' }, { status: 400 });
  }
  const auth: EvidenceAuthInput = {
    address: address as `0x${string}`,
    timestamp: Number(timestamp),
    signature: signature as `0x${string}`,
  };
  const v = await verifyClaimReviewer('sanctions:matches:list', auth);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const status = sp.get('status') ?? 'pending_sentinel';
  const { data, error } = await supabase
    .from('sanctions_matches')
    .select(
      'id, run_id, kyb_application_id, provider_match_id, matched_name, sanctions_list, severity, match_score, status, resolved_by, resolved_at, resolution_note, evidence, created_at',
    )
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    logApiError('sanctions/matches/list', 'db_error', { code: error.code ?? 'unknown' });
    return NextResponse.json({ error: 'db error' }, { status: 502 });
  }
  return NextResponse.json({ matches: data ?? [] });
}
