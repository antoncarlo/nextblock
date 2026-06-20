import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/notifications/auth';
import { getAIAssessorProvider } from '@/lib/ai-assessor/provider';
import { logApiError } from '@/lib/api-log';

/**
 * Off-chain AI claim assessor.
 *
 * Auth: shared CRON_SECRET (reused from sub-3 / sub-4 / sanctions — no new
 * env var). Used by either:
 *   - the claim notification refresh worker, when a new ClaimSubmitted log
 *     appears, to generate the assessment payload right away
 *   - a Sentinel operator triggering re-assessment manually via curl
 *
 * Body: { claimId: string, requestedAmount: string, description?: string }
 *
 * Outcome: a row in `ai_assessments_pending` with status='pending_publish'.
 * The on-chain `AIAssessor.publishAssessment` call is a separate Sentinel
 * Safe tx — same posture as sanctions_matches.
 *
 * Fail-closed: if the provider throws (e.g. Braino not configured), 503.
 */
interface Body {
  claimId?: string;
  requestedAmount?: string;
  description?: string;
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.claimId || !/^\d+$/.test(body.claimId)) {
    return NextResponse.json({ error: 'invalid claimId' }, { status: 400 });
  }
  if (!body.requestedAmount || !/^\d+$/.test(body.requestedAmount)) {
    return NextResponse.json({ error: 'invalid requestedAmount' }, { status: 400 });
  }

  let provider;
  try {
    provider = getAIAssessorProvider();
  } catch (err) {
    logApiError('ai/assess', 'provider_misconfigured', {
      code: err instanceof Error ? err.name : 'unknown',
    });
    return NextResponse.json({ error: 'provider misconfigured' }, { status: 503 });
  }

  let draft;
  try {
    draft = await provider.assess({
      claimId: BigInt(body.claimId),
      requestedAmount: BigInt(body.requestedAmount),
      description: body.description ?? '',
    });
  } catch (err) {
    logApiError('ai/assess', 'provider_failed', {
      code: err instanceof Error ? err.name : 'unknown',
    });
    return NextResponse.json({ error: 'provider failed' }, { status: 503 });
  }

  // Idempotency: refuse to overwrite an already-pending assessment for the
  // same claim. A Sentinel can mark the old row 'rejected' to allow a
  // re-assessment via the /reject endpoint (separate route).
  const { data: existing } = await supabase
    .from('ai_assessments_pending')
    .select('id')
    .eq('claim_id', Number(body.claimId))
    .eq('status', 'pending_publish')
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: 'pending assessment already exists for this claim', existingId: existing.id },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from('ai_assessments_pending')
    .insert({
      claim_id: Number(body.claimId),
      score_bps: draft.scoreBps,
      anomaly_score_bps: draft.anomalyScoreBps,
      confidence_bps: draft.confidenceBps,
      recommendation: draft.recommendation,
      recommended_amount: draft.recommendedAmount.toString(),
      source_hash: draft.sourceHash,
      provider: draft.provider,
      raw_response: draft.raw,
    })
    .select('id')
    .single();
  if (error || !data) {
    logApiError('ai/assess', 'insert_failed', { code: error?.code ?? 'unknown' });
    return NextResponse.json({ error: 'storage failed' }, { status: 502 });
  }

  return NextResponse.json({
    id: data.id,
    claimId: body.claimId,
    provider: draft.provider,
    recommendation: draft.recommendation,
    sourceHash: draft.sourceHash,
  });
}
