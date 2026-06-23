import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyOwnerSignature, type NotificationAuthInput } from '@/lib/notifications/auth';
import { normalizeAddress } from '@/lib/notifications/derive';
import { logApiError } from '@/lib/api-log';

/**
 * Per-address notification preferences.
 *
 *   GET  — read the caller's prefs (creates a default row on first read so
 *          the UI doesn't have to handle "not yet set" as a distinct state)
 *   POST — update the caller's prefs: in_app_enabled, email_enabled, email
 *
 * Auth: signature with action `notifications:prefs:<read|write>:<address>`,
 * same scope as the rest of the notifications surface. Privacy-by-default:
 * email defaults to OFF until the user explicitly opts in.
 */

const READ_ACTION = (addr: string) => `notifications:prefs:read:${addr}`;
const WRITE_ACTION = (addr: string) => `notifications:prefs:write:${addr}`;

interface PrefsRow {
  address: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  email: string | null;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

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
  const v = await verifyOwnerSignature(READ_ACTION(recipient), auth);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const { data: existing } = await supabase
    .from('notification_prefs')
    .select('address, in_app_enabled, email_enabled, email, updated_at')
    .eq('address', recipient)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ prefs: existing as PrefsRow });
  }

  // First read: seed defaults so subsequent updates are PUT-style with no
  // pre-create dance.
  const seed: Omit<PrefsRow, 'updated_at'> = {
    address: recipient,
    in_app_enabled: true,
    email_enabled: false,
    email: null,
  };
  const { error: seedErr } = await supabase.from('notification_prefs').insert({
    address: seed.address,
    in_app_enabled: seed.in_app_enabled,
    email_enabled: seed.email_enabled,
    email: seed.email,
  });
  if (seedErr && seedErr.code !== '23505') {
    // 23505 = unique violation (race: another request seeded first). Ignore.
    logApiError('notifications/prefs/get', 'seed_failed', { code: seedErr.code ?? 'unknown' });
  }
  return NextResponse.json({
    prefs: { ...seed, updated_at: new Date().toISOString() },
  });
}

interface UpdateBody {
  auth?: NotificationAuthInput;
  inAppEnabled?: boolean;
  emailEnabled?: boolean;
  /** Optional. Required if emailEnabled=true. */
  email?: string | null;
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.auth) return NextResponse.json({ error: 'missing auth' }, { status: 400 });

  const recipient = normalizeAddress(body.auth.address);
  const v = await verifyOwnerSignature(WRITE_ACTION(recipient), body.auth);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  if (body.emailEnabled === true) {
    if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return NextResponse.json({ error: 'valid email required when emailEnabled=true' }, { status: 400 });
    }
  }

  const patch: Partial<PrefsRow> & { updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.inAppEnabled === 'boolean') patch.in_app_enabled = body.inAppEnabled;
  if (typeof body.emailEnabled === 'boolean') patch.email_enabled = body.emailEnabled;
  if ('email' in body) patch.email = body.email ?? null;

  const { error } = await supabase
    .from('notification_prefs')
    .upsert({ address: recipient, ...patch }, { onConflict: 'address' });
  if (error) {
    logApiError('notifications/prefs/post', 'db_error', { code: error.code ?? 'unknown' });
    return NextResponse.json({ error: 'db error' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, address: recipient });
}
