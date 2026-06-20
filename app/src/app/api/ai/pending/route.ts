import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyClaimReviewer, type EvidenceAuthInput } from '@/lib/evidence/auth';
import { logApiError } from '@/lib/api-log';

/**
 * List pending AI assessments awaiting on-chain publish.
 *
 * Reviewer-auth (verifyClaimReviewer = Committee / Sentinel / Owner) — same
 * posture as the sanctions queue and Claims Control Room. The published_*
 * fields stay null until the Sentinel fires the on-chain tx and posts
 * back to /api/ai/pending/[id]/published.
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
  const v = await verifyClaimReviewer('ai:pending:list', auth);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const status = sp.get('status') ?? 'pending_publish';
  const { data, error } = await supabase
    .from('ai_assessments_pending')
    .select(
      'id, claim_id, score_bps, anomaly_score_bps, confidence_bps, recommendation, recommended_amount, source_hash, provider, raw_response, status, published_tx_hash, published_at, created_at',
    )
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    logApiError('ai/pending/list', 'db_error', { code: error.code ?? 'unknown' });
    return NextResponse.json({ error: 'db error' }, { status: 502 });
  }
  return NextResponse.json({ assessments: data ?? [] });
}
