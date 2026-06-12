import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import {
  kybReviewRequestSchema,
  isValidTransition,
  type KybStatus,
} from '@/lib/kyb/schema';
import { verifyOperatorAuth } from '@/lib/kyb/auth';
import { consumeNonce } from '@/lib/kyb/nonces';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/**
 * Operator review transition. The signed message binds application id AND
 * target status (action "review:<id>:<toStatus>") so one signature cannot be
 * repurposed for a different application or outcome.
 *
 * DB approval is INSTRUCTIONAL ONLY: nothing here touches the on-chain
 * ComplianceRegistry. The whitelist write remains a separate, explicitly
 * authorized KYC Operator act (Safe flow).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 30 review actions per IP per 10 minutes: roomier than the public submit
  // limit because one operator legitimately processes a whole queue.
  const limited = rateLimit('kyb-review', clientIp(request), 30, 10 * 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: 'too many requests' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid application id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = kybReviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation failed' }, { status: 400 });
  }
  const { toStatus, note, auth } = parsed.data;

  const verified = await verifyOperatorAuth(`review:${id}:${toStatus}`, {
    address: auth.address as `0x${string}`,
    timestamp: auth.timestamp,
    signature: auth.signature as `0x${string}`,
    nonce: auth.nonce,
  });
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  // Single use: consuming the nonce here makes the verified signature
  // unreplayable. Concurrent duplicates race this consume and exactly one
  // wins; expired/unknown nonces fail closed with a fresh-nonce retry path.
  if (!consumeNonce(verified.address, auth.nonce)) {
    return NextResponse.json(
      { error: 'nonce invalid, expired or already used; request a new one' },
      { status: 401 },
    );
  }

  const { data: application, error: fetchError } = await supabase
    .from('kyb_applications')
    .select('id, status')
    .eq('id', id)
    .single();
  if (fetchError || !application) {
    return NextResponse.json({ error: 'application not found' }, { status: 404 });
  }

  const fromStatus = application.status as KybStatus;
  if (!isValidTransition(fromStatus, toStatus)) {
    return NextResponse.json(
      { error: `invalid transition ${fromStatus} -> ${toStatus}` },
      { status: 422 },
    );
  }

  const { error: updateError } = await supabase
    .from('kyb_applications')
    .update({ status: toStatus })
    .eq('id', id)
    .eq('status', fromStatus); // optimistic guard against concurrent reviews
  if (updateError) {
    return NextResponse.json({ error: 'storage error' }, { status: 502 });
  }

  const { error: eventError } = await supabase.from('kyb_review_events').insert({
    application_id: id,
    actor_address: verified.address,
    from_status: fromStatus,
    to_status: toStatus,
    note: note || null,
  });
  if (eventError) {
    // The transition applied but the audit append failed: surface loudly.
    return NextResponse.json(
      { error: 'transition applied but audit event failed; investigate before further reviews' },
      { status: 500 },
    );
  }

  return NextResponse.json({ id, fromStatus, toStatus });
}
