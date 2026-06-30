import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyClaimUploader } from '@/lib/evidence/auth';
import { keccak256Hex } from '@/lib/evidence/hash';
import { logApiError } from '@/lib/api-log';

const BUCKET = 'claim-evidence';
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Upload claim evidence (claimant only). The signed action binds the claim id
 * AND the keccak256 of the bytes (`evidence:upload:<claimId>:<hash>`), so a
 * captured signature cannot be replayed against a different file. The document
 * is stored in the private bucket; only its hash + metadata go in the table.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'evidence backend unavailable' }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid multipart form' }, { status: 400 });
  }

  const file = form.get('file');
  const claimIdRaw = form.get('claimId');
  const address = form.get('address');
  const timestamp = form.get('timestamp');
  const signature = form.get('signature');
  if (
    !(file instanceof File) ||
    typeof claimIdRaw !== 'string' ||
    typeof address !== 'string' ||
    typeof timestamp !== 'string' ||
    typeof signature !== 'string'
  ) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: 'empty file' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'file exceeds 10 MB' }, { status: 413 });
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: 'bad address' }, { status: 400 });

  let claimId: bigint;
  try {
    claimId = BigInt(claimIdRaw);
  } catch {
    return NextResponse.json({ error: 'bad claimId' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentHash = keccak256Hex(bytes);

  const auth = await verifyClaimUploader(`evidence:upload:${claimId}:${contentHash}`, claimId, {
    address: address as `0x${string}`,
    timestamp: Number(timestamp),
    signature: signature as `0x${string}`,
  });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const path = `${claimId}/${crypto.randomUUID()}-${file.name}`;
  const up = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (up.error) {
    logApiError('claims/evidence/upload', 'storage_error', { code: up.error.name });
    return NextResponse.json({ error: 'storage error' }, { status: 502 });
  }

  const ins = await supabase.from('claim_evidence').insert({
    claim_id: Number(claimId),
    storage_path: path,
    content_hash: contentHash,
    file_name: file.name,
    content_type: file.type || 'application/octet-stream',
    size_bytes: file.size,
    uploader_addr: auth.address.toLowerCase(),
  });
  if (ins.error) {
    logApiError('claims/evidence/upload', 'db_error', { code: ins.error.code ?? 'unknown' });
    return NextResponse.json({ error: 'db error' }, { status: 502 });
  }

  return NextResponse.json({ contentHash, path });
}
