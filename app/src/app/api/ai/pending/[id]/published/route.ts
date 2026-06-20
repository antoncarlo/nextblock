import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyClaimReviewer, type EvidenceAuthInput } from '@/lib/evidence/auth';
import { logApiError } from '@/lib/api-log';

/**
 * Mark a pending AI assessment as published on-chain.
 *
 * Called by the Sentinel UI after a successful
 * `AIAssessor.publishAssessment` tx confirms. The tx hash is required and
 * recorded for audit. Reviewer-auth (same as the pending-list route).
 *
 * Idempotency: only flips `pending_publish` → `published`. Refuses repeat
 * calls or attempts to revive an already-rejected row (409).
 */
interface Body {
  txHash?: string;
  auth?: EvidenceAuthInput;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.txHash || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) {
    return NextResponse.json({ error: 'invalid txHash' }, { status: 400 });
  }
  if (!body.auth) return NextResponse.json({ error: 'missing auth' }, { status: 400 });

  const v = await verifyClaimReviewer(`ai:pending:published:${id}`, body.auth);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const { data, error } = await supabase
    .from('ai_assessments_pending')
    .update({
      status: 'published',
      published_tx_hash: body.txHash.toLowerCase(),
      published_at: new Date().toISOString(),
      published_by: v.address.toLowerCase(),
    })
    .eq('id', id)
    .eq('status', 'pending_publish')
    .select('id, claim_id, published_tx_hash')
    .single();
  if (error || !data) {
    logApiError('ai/pending/published', 'db_error', { code: error?.code ?? 'no-row' });
    return NextResponse.json({ error: 'not pending or db error' }, { status: 409 });
  }
  return NextResponse.json({ id: data.id, claimId: data.claim_id, txHash: data.published_tx_hash });
}
