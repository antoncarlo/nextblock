import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import {
  kybReviewRequestSchema,
  isValidTransition,
  type KybStatus,
} from '@/lib/kyb/schema';
import { verifyOperatorAuth } from '@/lib/kyb/auth';
import { getEmailActorFromRequest } from '@/lib/app-auth/session';
import { consumeNonce, createSupabaseNonceStore } from '@/lib/kyb/nonces';
import { clientIp, createSupabaseRateLimitStore, rateLimit } from '@/lib/rate-limit';
import { logApiError } from '@/lib/api-log';
import { getSanctionsProvider } from '@/lib/sanctions/provider';

/**
 * Operator review transition. Wallet reviews bind application id AND target
 * status in the signed message (action "review:<id>:<toStatus>") so one
 * signature cannot be repurposed. Email reviews require a server-validated
 * Supabase session with app-level KYB/admin RBAC.
 *
 * DB approval is INSTRUCTIONAL ONLY: nothing here touches the on-chain
 * ComplianceRegistry. The whitelist write remains a separate, explicitly
 * authorized KYC Operator act (Safe flow).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  // 30 review actions per IP per 10 minutes: roomier than the public submit
  // limit because one operator legitimately processes a whole queue.
  try {
    const limited = await rateLimit(
      'kyb-review',
      clientIp(request),
      30,
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
    logApiError('kyb/review', 'rate_limit_storage_error', { code: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'storage error' }, { status: 502 });
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

  const zeroAddress = '0x0000000000000000000000000000000000000000' as `0x${string}`;
  let actor:
    | { method: 'wallet'; address: `0x${string}`; userId?: never; email?: never }
    | { method: 'email'; address: `0x${string}`; userId: string; email: string };

  if (auth) {
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
    try {
      const nonceAccepted = await consumeNonce(verified.address, auth.nonce, createSupabaseNonceStore(supabase));
      if (!nonceAccepted) {
        return NextResponse.json(
          { error: 'nonce invalid, expired or already used; request a new one' },
          { status: 401 },
        );
      }
    } catch (error) {
      logApiError('kyb/review', 'nonce_storage_error', { code: error instanceof Error ? error.name : 'unknown' });
      return NextResponse.json({ error: 'storage error' }, { status: 502 });
    }

    actor = { method: 'wallet', address: verified.address };
  } else {
    const emailAuth = await getEmailActorFromRequest(request, ['admin', 'kyb_operator', 'reviewer']);
    if (!emailAuth.ok) {
      return NextResponse.json({ error: emailAuth.error }, { status: emailAuth.status });
    }
    actor = {
      method: 'email',
      address: emailAuth.actor.wallets.find(wallet => wallet.isPrimary)?.address ?? emailAuth.actor.wallets[0]?.address ?? zeroAddress,
      userId: emailAuth.actor.userId,
      email: emailAuth.actor.email,
    };
  }

  const { data: application, error: fetchError } = await supabase
    .from('kyb_applications')
    .select('id, status, company_name, jurisdiction')
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

  // Sanctions gate: the `under_review → approved` step is the moment the
  // entity becomes whitelistable, so this is the right hook to require a
  // clean screening result. Provider call + audit-log row + match persistence
  // happen BEFORE the status transition. On a match we leave the row in
  // `under_review` and surface the run + matches; a Sentinel resolves them
  // in /app/admin/sanctions before this endpoint will let the approve land.
  if (toStatus === 'approved') {
    const kybId = application.id as string;
    let provider;
    try {
      provider = getSanctionsProvider();
    } catch (err) {
      logApiError('kyb/review', 'sanctions_provider_misconfigured', {
        code: err instanceof Error ? err.name : 'unknown',
      });
      return NextResponse.json({ error: 'sanctions screening unavailable' }, { status: 503 });
    }

    const subject = {
      kybApplicationUuid: kybId,
      kind: 'entity' as const,
      name: application.company_name as string,
      country: typeof application.jurisdiction === 'string' ? application.jurisdiction.slice(0, 2).toUpperCase() : undefined,
    };

    const result = await provider.screen(subject);

    const { data: runRow, error: runErr } = await supabase
      .from('sanctions_screening_runs')
      .insert({
        kyb_application_id: kybId,
        subject_kind: subject.kind,
        subject_name: subject.name,
        subject_country: subject.country ?? null,
        provider: result.provider,
        provider_search_id: result.providerSearchId ?? null,
        result_code: result.resultCode,
        match_count: result.matches.length,
        raw_response: result.rawResponse ?? null,
      })
      .select('id')
      .single();
    if (runErr || !runRow) {
      logApiError('kyb/review', 'sanctions_run_insert_failed', { code: runErr?.code ?? 'unknown' });
      return NextResponse.json({ error: 'sanctions audit append failed' }, { status: 502 });
    }

    if (result.resultCode === 'error') {
      return NextResponse.json({ error: 'sanctions provider error' }, { status: 502 });
    }

    if (result.resultCode === 'match' && result.matches.length > 0) {
      const matchRows = result.matches.map((m) => ({
        run_id: runRow.id,
        kyb_application_id: kybId,
        provider_match_id: m.providerMatchId,
        matched_name: m.matchedName,
        sanctions_list: m.sanctionsList,
        severity: m.severity,
        match_score: m.matchScore ?? null,
        evidence: m.evidence ?? null,
      }));
      const { error: matchErr } = await supabase.from('sanctions_matches').insert(matchRows);
      if (matchErr) {
        logApiError('kyb/review', 'sanctions_match_insert_failed', { code: matchErr.code ?? 'unknown' });
        return NextResponse.json({ error: 'sanctions match persist failed' }, { status: 502 });
      }
      // Block the approve. The row stays under_review; the Sentinel queue
      // (/app/admin/sanctions) takes it from here.
      return NextResponse.json(
        {
          error: 'sanctions match — Sentinel review required',
          sanctionsRunId: runRow.id,
          matchCount: result.matches.length,
        },
        { status: 422 },
      );
    }
  }

  const { error: updateError } = await supabase
    .from('kyb_applications')
    .update({ status: toStatus })
    .eq('id', id)
    .eq('status', fromStatus); // optimistic guard against concurrent reviews
  if (updateError) {
    logApiError('kyb/review', 'transition_storage_error', { code: updateError.code });
    return NextResponse.json({ error: 'storage error' }, { status: 502 });
  }

  const { error: eventError } = await supabase.from('kyb_review_events').insert({
    application_id: id,
    actor_address: actor.address,
    actor_user_id: actor.method === 'email' ? actor.userId : null,
    actor_email: actor.method === 'email' ? actor.email : null,
    actor_method: actor.method,
    from_status: fromStatus,
    to_status: toStatus,
    note: note || null,
  });
  if (eventError) {
    // The transition applied but the audit append failed: surface loudly.
    logApiError('kyb/review', 'audit_append_failed', { code: eventError.code });
    return NextResponse.json(
      { error: 'transition applied but audit event failed; investigate before further reviews' },
      { status: 500 },
    );
  }

  return NextResponse.json({ id, fromStatus, toStatus });
}
