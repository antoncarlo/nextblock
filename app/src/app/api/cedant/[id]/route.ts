import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { logApiError } from '@/lib/api-log';

/**
 * Read a cedant application + profile snapshot.
 *
 * Public-ish: the orchestrator UI polls this from the cedant's own browser
 * while waiting for KYB + sanctions to clear. We bind reads to the wallet
 * address that submitted the KYB row, surfaced via the `wallet` query param —
 * a client claiming a different wallet sees nothing. This is intentionally
 * lower-friction than a signed read because the cedant has not yet been
 * onboarded (they may not have a stable signature flow set up); the data
 * exposed is just their own KYB status + their own profile they just submitted.
 *
 * For the Curator-facing review of cedant applications, use the
 * existing /api/kyb/applications listing (role-gated).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'wallet required' }, { status: 400 });
  }

  const { data: app, error: appErr } = await supabase
    .from('kyb_applications')
    .select('id, status, wallet_address, company_name, jurisdiction, created_at')
    .eq('id', id)
    .eq('applicant_type', 'cedant')
    .single();
  if (appErr || !app) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (app.wallet_address.toLowerCase() !== wallet.toLowerCase()) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { data: profile, error: profErr } = await supabase
    .from('cedant_profiles')
    .select(
      'policy_types, geo_scope, annual_premium_band, expected_ceded_capacity_usdc, primary_vault_address, vault_provisioned_at, vault_provisioned_by, notes',
    )
    .eq('application_id', id)
    .maybeSingle();
  if (profErr) {
    logApiError('cedant/read', 'profile_read_failed', { code: profErr.code ?? 'unknown' });
    return NextResponse.json({ error: 'storage error' }, { status: 502 });
  }

  // Has the screening run already completed for this application?
  const { data: screening } = await supabase
    .from('sanctions_screening_runs')
    .select('result_code, match_count, ts')
    .eq('kyb_application_id', id)
    .order('ts', { ascending: false })
    .limit(1);

  return NextResponse.json({
    application: {
      id: app.id,
      status: app.status,
      companyName: app.company_name,
      jurisdiction: app.jurisdiction,
      createdAt: app.created_at,
    },
    profile,
    sanctions: screening?.[0] ?? null,
    // Convenience flag for the orchestrator UI: ready to provision a vault?
    readyForVault: app.status === 'approved' && !profile?.primary_vault_address,
    vaultProvisioned: !!profile?.primary_vault_address,
  });
}
