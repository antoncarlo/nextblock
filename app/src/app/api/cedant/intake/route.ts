import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { cedantIntakeSchema } from '@/lib/cedant/schema';
import { clientIp, createSupabaseRateLimitStore, rateLimit } from '@/lib/rate-limit';
import { logApiError } from '@/lib/api-log';

/**
 * Cedant intake — atomic insert of kyb_applications (applicant_type='cedant')
 * + cedant_profiles. Same rate limiting + fail-closed posture as the generic
 * /api/kyb/applications POST. applicantType is forced to 'cedant' here
 * regardless of what the client claims.
 *
 * On success: returns { id, status, profile }. The orchestrator UI
 * (/app/cedant/onboard) polls the existing /api/kyb/applications/status
 * endpoint to advance step state.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  try {
    const limited = await rateLimit(
      'cedant-intake',
      clientIp(request),
      5,
      10 * 60 * 1000,
      createSupabaseRateLimitStore(supabase),
    );
    if (!limited.allowed) {
      return NextResponse.json(
        { error: 'too many requests' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
      );
    }
  } catch (error) {
    logApiError('cedant/intake', 'rate_limit_storage_error', { code: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'storage error' }, { status: 502 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = cedantIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation failed', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      { status: 400 },
    );
  }
  const { kyb, profile } = parsed.data;

  // Force applicant_type = 'cedant' on this route regardless of client input.
  const { data: app, error: kybErr } = await supabase
    .from('kyb_applications')
    .insert({
      applicant_type: 'cedant',
      wallet_address: kyb.walletAddress,
      company_name: kyb.companyName,
      legal_entity_type: kyb.legalEntityType,
      jurisdiction: kyb.jurisdiction,
      license_number: kyb.licenseNumber || null,
      declared_portfolio: kyb.declaredPortfolio || null,
      contact_name: kyb.contactName,
      contact_email: kyb.contactEmail,
      website: kyb.website || null,
      description: kyb.description || null,
      chain_id: kyb.chainId,
      status: 'submitted',
    })
    .select('id, status, created_at')
    .single();
  if (kybErr || !app) {
    logApiError('cedant/intake', 'kyb_insert_failed', { code: kybErr?.code ?? 'unknown' });
    return NextResponse.json({ error: 'kyb insert failed' }, { status: 502 });
  }

  const { error: profileErr } = await supabase.from('cedant_profiles').insert({
    application_id: app.id,
    policy_types: profile.policyTypes,
    geo_scope: profile.geoScope,
    annual_premium_band: profile.annualPremiumBand,
    expected_ceded_capacity_usdc: profile.expectedCededCapacityUsdc ?? null,
    notes: profile.notes || null,
  });
  if (profileErr) {
    // Rollback the KYB row to keep the 1:1 invariant: we don't want a
    // cedant KYB application without its profile, since the Curator review
    // depends on it.
    await supabase.from('kyb_applications').delete().eq('id', app.id);
    logApiError('cedant/intake', 'profile_insert_failed', { code: profileErr.code ?? 'unknown' });
    return NextResponse.json({ error: 'profile insert failed' }, { status: 502 });
  }

  return NextResponse.json({ id: app.id, status: app.status, createdAt: app.created_at });
}
