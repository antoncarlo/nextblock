import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyOwnerSignature, type NotificationAuthInput } from '@/lib/notifications/auth';
import { normalizeAddress } from '@/lib/notifications/derive';
import { logApiError } from '@/lib/api-log';

/**
 * GET  — list the caller's notifications (most recent first, capped).
 * POST — mark the caller's notifications as read by id.
 *
 * The signature auth proves the caller controls `address`; the queries are
 * always scoped to `recipient_addr = address.toLowerCase()` so a caller can
 * only ever see/touch their own rows. Same posture as KYB/evidence: RLS
 * deny-by-default on the table, service-role behind this route.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'notifications backend unavailable' }, { status: 503 });

  const sp = request.nextUrl.searchParams;
  const address = sp.get('address');
  const timestamp = sp.get('timestamp');
  const signature = sp.get('signature');
  if (!address || !timestamp || !signature || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'missing auth params' }, { status: 400 });
  }

  const auth: NotificationAuthInput = {
    address: address as `0x${string}`,
    timestamp: Number(timestamp),
    signature: signature as `0x${string}`,
  };
  const recipient = normalizeAddress(address);
  const v = await verifyOwnerSignature(`notifications:list:${recipient}`, auth);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const limitRaw = Number(sp.get('limit') ?? DEFAULT_LIMIT);
  const limit = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_LIMIT, MAX_LIMIT);
  const unreadOnly = sp.get('unread') === '1';

  let q = supabase
    .from('notifications')
    .select('id, claim_id, vault, kind, from_status, to_status, message, read_at, created_at')
    .eq('recipient_addr', recipient)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (unreadOnly) q = q.is('read_at', null);

  const { data, error } = await q;
  if (error) {
    logApiError('notifications/list', 'db_error', { code: error.code ?? 'unknown' });
    return NextResponse.json({ error: 'db error' }, { status: 502 });
  }
  return NextResponse.json({ notifications: data ?? [] });
}

interface ReadBody {
  auth?: NotificationAuthInput;
  ids?: string[];
  all?: boolean;
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'notifications backend unavailable' }, { status: 503 });

  let body: ReadBody;
  try {
    body = (await request.json()) as ReadBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.auth || !body.auth.address || !body.auth.timestamp || !body.auth.signature) {
    return NextResponse.json({ error: 'missing auth' }, { status: 400 });
  }
  if (!body.all && (!Array.isArray(body.ids) || body.ids.length === 0)) {
    return NextResponse.json({ error: 'no ids and all=false' }, { status: 400 });
  }
  const recipient = normalizeAddress(body.auth.address);
  const v = await verifyOwnerSignature(`notifications:read:${recipient}`, body.auth);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const update = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_addr', recipient)
    .is('read_at', null);
  const { error } = body.all ? await update : await update.in('id', body.ids!);
  if (error) {
    logApiError('notifications/read', 'db_error', { code: error.code ?? 'unknown' });
    return NextResponse.json({ error: 'db error' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
