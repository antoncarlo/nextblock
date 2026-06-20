import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/notifications/auth';
import { logApiError } from '@/lib/api-log';

/**
 * Persist a bordereau assertion draft.
 *
 * Auth: shared CRON_SECRET (cedant ops back-office cron, not user-facing).
 * A separate cedant-signature path can be added later when we surface a UI
 * for the cedant to upload bordereau files themselves; this first cut keeps
 * the entrypoint server-only.
 *
 * Body:
 *   - portfolioId    (string of uint)
 *   - assertionType  (number, mirrors BordereauOracle.AssertionType)
 *   - dataHash       (0x + 64 hex; keccak256 of the file/payload)
 *   - dataURI        (ipfs://… or supabase storage URL)
 *   - declaredAmount (string of uint, USDC base units)
 *   - submittedBy    (0x + 40 hex; wallet that owns the bordereau)
 *
 * Idempotency: keyed by (portfolio_id, data_hash) — re-posting the same
 * payload yields 409 with the existing id.
 *
 * On-chain proposal stays a separate Sentinel/Cedant Safe tx (mirrors the
 * AIAssessor publish pattern).
 */
interface Body {
  portfolioId?: string;
  assertionType?: number;
  dataHash?: string;
  dataURI?: string;
  declaredAmount?: string;
  submittedBy?: string;
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
  if (!body.portfolioId || !/^\d+$/.test(body.portfolioId)) {
    return NextResponse.json({ error: 'invalid portfolioId' }, { status: 400 });
  }
  if (typeof body.assertionType !== 'number' || body.assertionType < 0) {
    return NextResponse.json({ error: 'invalid assertionType' }, { status: 400 });
  }
  if (!body.dataHash || !/^0x[0-9a-f]{64}$/i.test(body.dataHash)) {
    return NextResponse.json({ error: 'invalid dataHash' }, { status: 400 });
  }
  if (!body.dataURI || body.dataURI.length === 0 || body.dataURI.length > 2000) {
    return NextResponse.json({ error: 'invalid dataURI' }, { status: 400 });
  }
  if (!body.declaredAmount || !/^\d+$/.test(body.declaredAmount)) {
    return NextResponse.json({ error: 'invalid declaredAmount' }, { status: 400 });
  }
  if (!body.submittedBy || !/^0x[0-9a-fA-F]{40}$/.test(body.submittedBy)) {
    return NextResponse.json({ error: 'invalid submittedBy' }, { status: 400 });
  }

  const dataHashLower = body.dataHash.toLowerCase();
  const submittedByLower = body.submittedBy.toLowerCase();

  // Idempotency check by (portfolio, dataHash).
  const { data: existing } = await supabase
    .from('bordereau_assertions_pending')
    .select('id, status')
    .eq('portfolio_id', Number(body.portfolioId))
    .eq('data_hash', dataHashLower)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: 'duplicate bordereau (same portfolio+hash)', existingId: existing.id, status: existing.status },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from('bordereau_assertions_pending')
    .insert({
      portfolio_id: Number(body.portfolioId),
      assertion_type: body.assertionType,
      data_hash: dataHashLower,
      data_uri: body.dataURI,
      declared_amount: body.declaredAmount,
      submitted_by: submittedByLower,
    })
    .select('id')
    .single();
  if (error || !data) {
    logApiError('bordereau/propose', 'insert_failed', { code: error?.code ?? 'unknown' });
    return NextResponse.json({ error: 'storage failed' }, { status: 502 });
  }

  return NextResponse.json({ id: data.id, portfolioId: body.portfolioId, dataHash: dataHashLower });
}
