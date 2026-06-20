import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { logApiError } from '@/lib/api-log';

/**
 * Look up the cedant application that belongs to a wallet.
 *
 * Used by:
 *   - the Header to decide whether to show the cedant nav link
 *   - the /app/cedant/dashboard route to load the cedant's own profile
 *
 * Auth posture: same as /api/cedant/[id]?wallet — bound to the wallet that
 * the kyb row was submitted with. We don't require a signature because the
 * surface is intentionally narrow (read-only, scoped to the caller's own
 * application) and pre-signature flows must remain accessible during
 * onboarding.
 *
 * Returns 404 when no cedant application exists for the wallet.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'wallet required' }, { status: 400 });
  }

  const { data: app, error: appErr } = await supabase
    .from('kyb_applications')
    .select('id, status, company_name, jurisdiction, contact_name, contact_email, created_at')
    .eq('applicant_type', 'cedant')
    .ilike('wallet_address', wallet)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (appErr) {
    logApiError('cedant/by-wallet', 'app_read_failed', { code: appErr.code ?? 'unknown' });
    return NextResponse.json({ error: 'storage error' }, { status: 502 });
  }
  if (!app) return NextResponse.json({ error: 'no cedant application for wallet' }, { status: 404 });

  const { data: profile } = await supabase
    .from('cedant_profiles')
    .select(
      'policy_types, geo_scope, annual_premium_band, expected_ceded_capacity_usdc, primary_vault_address, vault_provisioned_at, vault_provisioned_by, notes',
    )
    .eq('application_id', app.id)
    .maybeSingle();

  const { data: screening } = await supabase
    .from('sanctions_screening_runs')
    .select('result_code, match_count, ts')
    .eq('kyb_application_id', app.id)
    .order('ts', { ascending: false })
    .limit(1);

  // Last 5 audit-trail rows tied to this cedant's claims — surfaced as
  // a compact recent-activity feed on the dashboard. Joining on claim_id
  // would require knowing this cedant's claim ids; for now we filter by
  // the vault address (lowercased) which the audit decoder normalizes
  // into the row's `data.vault` for ClaimSubmitted events.
  let auditFeed: Array<{
    id: string;
    event_name: string;
    block_number: number;
    tx_hash: string;
    ts: string;
  }> = [];
  if (profile?.primary_vault_address) {
    const { data: auditRows } = await supabase
      .from('claim_audit_trail')
      .select('id, event_name, block_number, tx_hash, ts, data')
      .order('block_number', { ascending: false })
      .order('log_index', { ascending: false })
      .limit(50);
    const vaultLower = profile.primary_vault_address;
    auditFeed = (auditRows ?? [])
      .filter((r) => {
        const v = (r.data as { vault?: string } | null)?.vault;
        return typeof v === 'string' && v.toLowerCase() === vaultLower;
      })
      .slice(0, 5)
      .map(({ id, event_name, block_number, tx_hash, ts }) => ({ id, event_name, block_number, tx_hash, ts }));
  }

  return NextResponse.json({
    application: {
      id: app.id,
      status: app.status,
      companyName: app.company_name,
      jurisdiction: app.jurisdiction,
      contactName: app.contact_name,
      contactEmail: app.contact_email,
      createdAt: app.created_at,
    },
    profile,
    sanctions: screening?.[0] ?? null,
    auditFeed,
    vaultProvisioned: !!profile?.primary_vault_address,
  });
}
