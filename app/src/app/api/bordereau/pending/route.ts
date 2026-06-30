import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyClaimReviewer, type EvidenceAuthInput } from '@/lib/evidence/auth';
import { logApiError } from '@/lib/api-log';

/**
 * List bordereau assertions awaiting on-chain propose.
 *
 * Reviewer-auth — same posture as ai/pending and sanctions/matches. Joins
 * the latest uploaded file metadata so the UI can render file name +
 * download link per row.
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
  const v = await verifyClaimReviewer('bordereau:pending:list', auth);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const status = sp.get('status') ?? 'pending_propose';
  const { data, error } = await supabase
    .from('bordereau_assertions_pending')
    .select(
      'id, portfolio_id, assertion_type, data_hash, data_uri, declared_amount, status, submitted_by, proposed_tx_hash, proposed_at, created_at',
    )
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    logApiError('bordereau/pending/list', 'db_error', { code: error.code ?? 'unknown' });
    return NextResponse.json({ error: 'db error' }, { status: 502 });
  }
  return NextResponse.json({ assertions: data ?? [] });
}
