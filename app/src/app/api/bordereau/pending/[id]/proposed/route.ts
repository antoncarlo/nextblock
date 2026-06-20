import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyClaimReviewer, type EvidenceAuthInput } from '@/lib/evidence/auth';
import { logApiError } from '@/lib/api-log';

/**
 * Mark a pending bordereau assertion as proposed on-chain.
 *
 * Called by the Sentinel UI after a successful BordereauOracle.proposeAssertion
 * tx confirms. The tx hash is required and recorded for audit.
 *
 * Idempotency: only flips pending_propose → proposed.
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

  const v = await verifyClaimReviewer(`bordereau:pending:proposed:${id}`, body.auth);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const { data, error } = await supabase
    .from('bordereau_assertions_pending')
    .update({
      status: 'proposed',
      proposed_tx_hash: body.txHash.toLowerCase(),
      proposed_at: new Date().toISOString(),
      proposed_by: v.address.toLowerCase(),
    })
    .eq('id', id)
    .eq('status', 'pending_propose')
    .select('id, portfolio_id, proposed_tx_hash')
    .single();
  if (error || !data) {
    logApiError('bordereau/proposed', 'db_error', { code: error?.code ?? 'no-row' });
    return NextResponse.json({ error: 'not pending or db error' }, { status: 409 });
  }
  return NextResponse.json({ id: data.id, portfolioId: data.portfolio_id, txHash: data.proposed_tx_hash });
}
