import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyClaimReviewer, verifyClaimUploader, type EvidenceAuthInput } from '@/lib/evidence/auth';
import { logApiError } from '@/lib/api-log';

const BUCKET = 'claim-evidence';
const SIGNED_URL_TTL_SEC = 60;

const schema = z.object({
  evidenceId: z.string().uuid(),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  timestamp: z.number(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

/**
 * Issue a short-lived signed URL for one evidence object. Authorized for
 * reviewers (Committee/Sentinel/Owner) or the claim's claimant. The bucket is
 * private; this is the only way to read a document.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'evidence backend unavailable' }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  const { evidenceId, address, timestamp, signature } = parsed.data;

  const { data: row, error: selErr } = await supabase
    .from('claim_evidence')
    .select('claim_id, storage_path')
    .eq('id', evidenceId)
    .single();
  if (selErr || !row) return NextResponse.json({ error: 'evidence not found' }, { status: 404 });

  const claimId = BigInt(row.claim_id as number);
  const auth: EvidenceAuthInput = {
    address: address as `0x${string}`,
    timestamp,
    signature: signature as `0x${string}`,
  };
  const action = `evidence:download:${evidenceId}`;
  let authorized = (await verifyClaimReviewer(action, auth)).ok;
  if (!authorized) authorized = (await verifyClaimUploader(action, claimId, auth)).ok;
  if (!authorized) return NextResponse.json({ error: 'not authorized' }, { status: 403 });

  const { data: signed, error: urlErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path as string, SIGNED_URL_TTL_SEC);
  if (urlErr || !signed) {
    logApiError('claims/evidence/download', 'signed_url_error', { code: urlErr?.name ?? 'unknown' });
    return NextResponse.json({ error: 'could not sign url' }, { status: 502 });
  }
  return NextResponse.json({ url: signed.signedUrl, expiresInSec: SIGNED_URL_TTL_SEC });
}
