import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyClaimReviewer, verifyClaimUploader, type EvidenceAuthInput } from '@/lib/evidence/auth';
import { logApiError } from '@/lib/api-log';

/**
 * List evidence metadata for a claim (no bytes). Authorized for reviewers
 * (Committee/Sentinel/Owner) or the claim's claimant. Auth is a timestamp-window
 * signature over `evidence:list:<claimId>`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ claimId: string }> }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'evidence backend unavailable' }, { status: 503 });

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
  const action = `evidence:list:${claimId}`;
  let authorized = (await verifyClaimReviewer(action, auth)).ok;
  if (!authorized) authorized = (await verifyClaimUploader(action, claimId, auth)).ok;
  if (!authorized) return NextResponse.json({ error: 'not authorized to view this claim evidence' }, { status: 403 });

  const { data, error } = await supabase
    .from('claim_evidence')
    .select('id, file_name, content_type, size_bytes, content_hash, uploader_addr, created_at')
    .eq('claim_id', Number(claimId))
    .order('created_at', { ascending: false });
  if (error) {
    logApiError('claims/evidence/list', 'db_error', { code: error.code ?? 'unknown' });
    return NextResponse.json({ error: 'db error' }, { status: 502 });
  }
  return NextResponse.json({ evidence: data ?? [] });
}
