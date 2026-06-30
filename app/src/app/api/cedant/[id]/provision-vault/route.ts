import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyClaimReviewer, type EvidenceAuthInput } from '@/lib/evidence/auth';
import { logApiError } from '@/lib/api-log';

/**
 * Record the dedicated vault address provisioned by the Curator for a cedant.
 *
 * The on-chain VaultFactory.createVault call is fired by the Curator from
 * their wallet (UI step 3 builds the tx; this endpoint just records the
 * resulting address into cedant_profiles so the orchestrator can advance).
 *
 * Auth: same reviewer-grade signature as the Claims surfaces — the Curator
 * role is enforced on-chain via UNDERWRITING_CURATOR_ROLE (VaultFactory
 * reverts otherwise). Reusing verifyClaimReviewer is over-strict here
 * (it accepts Committee/Sentinel/Owner too), but for the pilot the
 * over-strict variant is safer than rolling a new on-chain role check;
 * the on-chain createVault tx is the real gate.
 *
 * Idempotency: returns 409 if a vault address is already recorded for
 * the application; this prevents accidental double-provision drift.
 */
interface Body {
  vaultAddress?: string;
  /** On-chain tx hash of the createVault transaction, for audit. */
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
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!body.vaultAddress || !/^0x[0-9a-fA-F]{40}$/.test(body.vaultAddress)) {
    return NextResponse.json({ error: 'invalid vaultAddress' }, { status: 400 });
  }
  if (!body.auth) return NextResponse.json({ error: 'missing auth' }, { status: 400 });

  const v = await verifyClaimReviewer(`cedant:provision-vault:${id}`, body.auth);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  // Application must be approved before a vault can be recorded.
  const { data: app, error: appErr } = await supabase
    .from('kyb_applications')
    .select('id, status, applicant_type')
    .eq('id', id)
    .single();
  if (appErr || !app) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (app.applicant_type !== 'cedant') {
    return NextResponse.json({ error: 'application is not a cedant' }, { status: 422 });
  }
  if (app.status !== 'approved') {
    return NextResponse.json({ error: `cedant not approved (status=${app.status})` }, { status: 422 });
  }

  const vaultLower = body.vaultAddress.toLowerCase();
  const { data: updated, error: upErr } = await supabase
    .from('cedant_profiles')
    .update({
      primary_vault_address: vaultLower,
      vault_provisioned_at: new Date().toISOString(),
      vault_provisioned_by: v.address.toLowerCase(),
      updated_at: new Date().toISOString(),
    })
    .eq('application_id', id)
    .is('primary_vault_address', null) // idempotency: refuse double-provision
    .select('application_id, primary_vault_address')
    .single();
  if (upErr || !updated) {
    logApiError('cedant/provision-vault', 'update_failed', { code: upErr?.code ?? 'no-row' });
    return NextResponse.json({ error: 'already provisioned or db error' }, { status: 409 });
  }

  return NextResponse.json({
    id: updated.application_id,
    vaultAddress: updated.primary_vault_address,
    provisionedBy: v.address.toLowerCase(),
    onChainTxHash: body.txHash ?? null,
  });
}
