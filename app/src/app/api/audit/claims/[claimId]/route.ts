import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyClaimReviewer, verifyClaimUploader, type EvidenceAuthInput } from '@/lib/evidence/auth';
import { logApiError } from '@/lib/api-log';

/**
 * Read the immutable audit trail for one claim.
 *
 * Auth: same posture as evidence list — a signature-bound reviewer
 * (Committee/Sentinel/Owner) OR the claimant of the claim. The signature
 * action is `audit:list:<claimId>` so reusing an evidence signature won't
 * leak access (different action string → different keccak digest).
 *
 * Returns rows newest-first. `data` is the normalized event args (jsonb).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ claimId: string }> }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'audit backend unavailable' }, { status: 503 });

  const { claimId: claimIdStr } = await params;
  let claimId: bigint;
  try {
    claimId = BigInt(claimIdStr);
  } catch {
    return NextResponse.json({ error: 'bad claimId' }, { status: 400 });
  }

  const sp = request.nextUrl.searchParams;
  const address = sp.get('address');
  const timestamp = sp.get('timestamp');
  const signature = sp.get('signature');
  if (!address || !timestamp || !signature || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'missing auth params' }, { status: 400 });
  }

  const auth: EvidenceAuthInput = {
    address: address as `0x${string}`,
    timestamp: Number(timestamp),
    signature: signature as `0x${string}`,
  };
  const action = `audit:list:${claimId}`;
  let authorized = (await verifyClaimReviewer(action, auth)).ok;
  if (!authorized) authorized = (await verifyClaimUploader(action, claimId, auth)).ok;
  if (!authorized) {
    return NextResponse.json({ error: 'not authorized to view this audit trail' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('claim_audit_trail')
    .select('id, event_name, block_number, log_index, tx_hash, contract_addr, actor, data, ts')
    .eq('claim_id', Number(claimId))
    .order('block_number', { ascending: false })
    .order('log_index', { ascending: false });
  if (error) {
    logApiError('audit/claims/list', 'db_error', { code: error.code ?? 'unknown' });
    return NextResponse.json({ error: 'db error' }, { status: 502 });
  }
  return NextResponse.json({ trail: data ?? [] });
}
