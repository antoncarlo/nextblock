import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/notifications/auth';
import { getAIAssessorProvider } from '@/lib/ai-assessor/provider';
import { logApiError } from '@/lib/api-log';

/**
 * AI claim assessor — cron auto-trigger.
 *
 * Walks `claim_audit_trail` for `ClaimSubmitted` events whose `claim_id` does
 * NOT yet have any row in `ai_assessments_pending` (regardless of status), and
 * generates a draft assessment for each. The draft is persisted with
 * status='pending_publish'; the Sentinel publishes on-chain from
 * /app/admin/ai-assessments.
 *
 * Why this design: the previous `POST /api/ai/assess` was operator-triggered
 * with explicit claimId + requestedAmount. This route closes the loop so a
 * new claim automatically gets an assessment draft without a curl call.
 *
 * Auth: shared CRON_SECRET (reused from sub-3 / sub-4 / sanctions / ai).
 * Vercel cron schedule: every 15 minutes (lighter than 5min — the AI
 * provider may have non-trivial cost).
 */

const MAX_CLAIMS_PER_RUN = 25;

interface ClaimSubmittedRow {
  claim_id: number;
  data: { requestedAmount?: string; evidenceHash?: string } | null;
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let provider;
  try {
    provider = getAIAssessorProvider();
  } catch (err) {
    logApiError('ai/refresh', 'provider_misconfigured', {
      code: err instanceof Error ? err.name : 'unknown',
    });
    return NextResponse.json({ error: 'provider misconfigured' }, { status: 503 });
  }

  // 1. Find ClaimSubmitted entries in the audit trail (oldest first so the
  //    cron eventually catches up if it falls behind).
  const { data: submittedRows, error: trailErr } = await supabase
    .from('claim_audit_trail')
    .select('claim_id, data')
    .eq('event_name', 'ClaimSubmitted')
    .order('block_number', { ascending: true })
    .limit(MAX_CLAIMS_PER_RUN * 4); // overfetch; we filter below
  if (trailErr) {
    logApiError('ai/refresh', 'trail_read_failed', { code: trailErr.code ?? 'unknown' });
    return NextResponse.json({ error: 'storage error' }, { status: 502 });
  }
  const submitted = (submittedRows ?? []) as ClaimSubmittedRow[];
  if (submitted.length === 0) {
    return NextResponse.json({ scanned: 0, drafted: 0 });
  }

  // 2. Filter to those without any assessment row yet (independent of status).
  const ids = Array.from(new Set(submitted.map((r) => r.claim_id)));
  const { data: alreadyAssessed } = await supabase
    .from('ai_assessments_pending')
    .select('claim_id')
    .in('claim_id', ids);
  const seen = new Set((alreadyAssessed ?? []).map((r) => r.claim_id));
  const todo = submitted.filter((r) => !seen.has(r.claim_id)).slice(0, MAX_CLAIMS_PER_RUN);

  let drafted = 0;
  for (const row of todo) {
    const requestedAmountStr = row.data?.requestedAmount ?? '0';
    let requestedAmount: bigint;
    try {
      requestedAmount = BigInt(requestedAmountStr);
    } catch {
      requestedAmount = 0n;
    }
    if (requestedAmount === 0n) continue;

    // The mock provider derives behavior from a magic-substring description.
    // For real Braino we'll pass real evidence text; for now an empty string is
    // fine — the on-chain sourceHash is still anchored to (claimId, amount, '').
    let draft;
    try {
      draft = await provider.assess({
        claimId: BigInt(row.claim_id),
        requestedAmount,
        description: '',
      });
    } catch (err) {
      logApiError('ai/refresh', 'provider_failed', {
        code: err instanceof Error ? err.name : 'unknown',
      });
      continue;
    }

    const { error: insErr } = await supabase.from('ai_assessments_pending').insert({
      claim_id: row.claim_id,
      score_bps: draft.scoreBps,
      anomaly_score_bps: draft.anomalyScoreBps,
      confidence_bps: draft.confidenceBps,
      recommendation: draft.recommendation,
      recommended_amount: draft.recommendedAmount.toString(),
      source_hash: draft.sourceHash,
      provider: draft.provider,
      raw_response: draft.raw,
    });
    if (insErr) {
      logApiError('ai/refresh', 'insert_failed', { code: insErr.code ?? 'unknown' });
      continue;
    }
    drafted += 1;
  }

  return NextResponse.json({ scanned: todo.length, drafted });
}
