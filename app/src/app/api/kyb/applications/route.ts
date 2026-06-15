import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { kybApplicationPayloadSchema } from '@/lib/kyb/schema';
import { verifyOperatorAuth } from '@/lib/kyb/auth';
import { getEmailActorFromRequest } from '@/lib/app-auth/session';
import { clientIp, createSupabaseRateLimitStore, rateLimit } from '@/lib/rate-limit';
import { logApiError } from '@/lib/api-log';

/**
 * KYB applications collection.
 *
 *   POST  public submit (zod-validated, lands in status 'submitted')
 *   GET   operator-only listing (wallet signature + on-chain role check,
 *         or authorized email session with app-level RBAC)
 *
 * Fail-closed: without the server Supabase configuration every method returns
 * 503 "unavailable" instead of pretending state exists.
 */

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  // 5 submissions per IP per 10 minutes, shared across serverless instances.
  try {
    const limited = await rateLimit(
      'kyb-submit',
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
    logApiError('kyb/applications', 'rate_limit_storage_error', { code: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'storage error' }, { status: 502 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = kybApplicationPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation failed', issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) },
      { status: 400 },
    );
  }
  const p = parsed.data;

  const { data, error } = await supabase
    .from('kyb_applications')
    .insert({
      applicant_type: p.applicantType,
      wallet_address: p.walletAddress,
      company_name: p.companyName,
      legal_entity_type: p.legalEntityType,
      jurisdiction: p.jurisdiction,
      license_number: p.licenseNumber || null,
      declared_portfolio: p.declaredPortfolio || null,
      contact_name: p.contactName,
      contact_email: p.contactEmail,
      website: p.website || null,
      description: p.description || null,
      chain_id: p.chainId,
      status: 'submitted',
    })
    .select('id, status, created_at')
    .single();

  if (error) {
    // Partial unique index: one active application per wallet+type.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'an active application already exists for this wallet and role' },
        { status: 409 },
      );
    }
    logApiError('kyb/applications', 'submit_storage_error', { code: error.code });
    return NextResponse.json({ error: 'storage error' }, { status: 502 });
  }

  return NextResponse.json({ id: data.id, status: data.status, createdAt: data.created_at }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  const address = request.headers.get('x-kyb-address');
  const timestamp = Number(request.headers.get('x-kyb-timestamp'));
  const signature = request.headers.get('x-kyb-signature');

  if (address && signature && Number.isInteger(timestamp)) {
    const auth = await verifyOperatorAuth('list', {
      address: address as `0x${string}`,
      timestamp,
      signature: signature as `0x${string}`,
    });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
  } else {
    const emailAuth = await getEmailActorFromRequest(request, ['admin', 'kyb_operator', 'reviewer']);
    if (!emailAuth.ok) {
      return NextResponse.json({ error: emailAuth.error }, { status: emailAuth.status });
    }
  }

  const { data: applications, error } = await supabase
    .from('kyb_applications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    logApiError('kyb/applications', 'list_storage_error', { code: error.code });
    return NextResponse.json({ error: 'storage error' }, { status: 502 });
  }

  const { data: events } = await supabase
    .from('kyb_review_events')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1000);

  return NextResponse.json({ applications: applications ?? [], events: events ?? [] });
}
