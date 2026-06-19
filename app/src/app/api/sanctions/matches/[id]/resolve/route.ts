import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyClaimReviewer, type EvidenceAuthInput } from '@/lib/evidence/auth';
import { logApiError } from '@/lib/api-log';

/**
 * Resolve a sanctions match.
 *
 * The on-chain `setBlocked` (true_match) or `setWhitelist` (false_positive)
 * call is INTENTIONALLY left to a separate, explicitly authorized Sentinel
 * Safe / multisig transaction — same posture as the existing KYB approve →
 * setWhitelist split. This route only records the decision in the
 * append-only `sanctions_matches` table so the on-chain action has an
 * auditable rationale. UI surfaces the address + decision and Sentinel
 * fires the on-chain tx from their existing tooling.
 *
 * Body: { resolution: 'false_positive' | 'true_match', note?: string, auth }
 */
interface ResolveBody {
  resolution?: 'false_positive' | 'true_match';
  note?: string;
  auth?: EvidenceAuthInput;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid match id' }, { status: 400 });
  }

  let body: ResolveBody;
  try {
    body = (await request.json()) as ResolveBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.auth) return NextResponse.json({ error: 'missing auth' }, { status: 400 });
  if (body.resolution !== 'false_positive' && body.resolution !== 'true_match') {
    return NextResponse.json({ error: 'invalid resolution' }, { status: 400 });
  }

  const v = await verifyClaimReviewer(`sanctions:resolve:${id}:${body.resolution}`, body.auth);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const { error: updErr, data } = await supabase
    .from('sanctions_matches')
    .update({
      status: body.resolution,
      resolved_by: v.address.toLowerCase(),
      resolved_at: new Date().toISOString(),
      resolution_note: body.note ?? null,
    })
    .eq('id', id)
    .eq('status', 'pending_sentinel') // optimistic guard against double-resolve
    .select('id, kyb_application_id')
    .single();
  if (updErr || !data) {
    logApiError('sanctions/resolve', 'db_error', { code: updErr?.code ?? 'no-row' });
    return NextResponse.json({ error: 'match not pending or db error' }, { status: 409 });
  }

  return NextResponse.json({
    id: data.id,
    resolution: body.resolution,
    kybApplicationId: data.kyb_application_id,
    onChainAction:
      body.resolution === 'true_match'
        ? 'Sentinel must now call ComplianceRegistry.setBlocked(wallet, true) via Safe.'
        : 'Sentinel may now proceed to setWhitelist(wallet, true) and re-trigger the KYB approve.',
  });
}
