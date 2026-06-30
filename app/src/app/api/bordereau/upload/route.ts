import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyClaimReviewer, type EvidenceAuthInput } from '@/lib/evidence/auth';
import { keccak256Hex } from '@/lib/evidence/hash';
import { logApiError } from '@/lib/api-log';

const BUCKET = 'bordereau-files';
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB — bordereau payloads can be large

/**
 * Upload a bordereau file (cedant or curator side).
 *
 * Auth: signature with action `bordereau:upload:<portfolioId>:<contentHash>`
 * — the hash binds the signature to the bytes, so a captured signature
 * cannot be replayed with a different file. We accept either a Curator or
 * a Sentinel-grade signer (`verifyClaimReviewer` matches all reviewer
 * roles, which is the right superset for bordereau intake during pilot).
 *
 * Side effect: also creates / upserts a bordereau_assertions_pending row
 * keyed by (portfolio_id, contentHash) so the Sentinel publish UI has
 * something to act on. Idempotent.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'bordereau backend unavailable' }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid multipart form' }, { status: 400 });
  }

  const file = form.get('file');
  const portfolioIdRaw = form.get('portfolioId');
  const assertionTypeRaw = form.get('assertionType');
  const declaredAmountRaw = form.get('declaredAmount');
  const address = form.get('address');
  const timestamp = form.get('timestamp');
  const signature = form.get('signature');

  if (
    !(file instanceof File) ||
    typeof portfolioIdRaw !== 'string' ||
    typeof assertionTypeRaw !== 'string' ||
    typeof declaredAmountRaw !== 'string' ||
    typeof address !== 'string' ||
    typeof timestamp !== 'string' ||
    typeof signature !== 'string'
  ) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  if (!/^\d+$/.test(portfolioIdRaw) || !/^\d+$/.test(assertionTypeRaw) || !/^\d+$/.test(declaredAmountRaw)) {
    return NextResponse.json({ error: 'invalid numeric field' }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: 'empty file' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'file exceeds 25 MB' }, { status: 413 });
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: 'bad address' }, { status: 400 });

  const portfolioId = BigInt(portfolioIdRaw);
  const assertionType = Number(assertionTypeRaw);
  const declaredAmount = BigInt(declaredAmountRaw);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentHash = keccak256Hex(bytes);

  const auth: EvidenceAuthInput = {
    address: address as `0x${string}`,
    timestamp: Number(timestamp),
    signature: signature as `0x${string}`,
  };
  const v = await verifyClaimReviewer(`bordereau:upload:${portfolioId}:${contentHash}`, auth);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const path = `${portfolioId}/${crypto.randomUUID()}-${file.name}`;
  const up = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (up.error) {
    logApiError('bordereau/upload', 'storage_error', { code: up.error.name });
    return NextResponse.json({ error: 'storage error' }, { status: 502 });
  }

  // Idempotency: if a pending assertion with same (portfolio, hash) already
  // exists, just attach a new file row to it. Otherwise create the assertion.
  const { data: existing } = await supabase
    .from('bordereau_assertions_pending')
    .select('id')
    .eq('portfolio_id', Number(portfolioId))
    .eq('data_hash', contentHash)
    .maybeSingle();

  let assertionId: string;
  if (existing) {
    assertionId = existing.id;
  } else {
    const dataURI = `supabase://${BUCKET}/${path}`;
    const { data: created, error: insErr } = await supabase
      .from('bordereau_assertions_pending')
      .insert({
        portfolio_id: Number(portfolioId),
        assertion_type: assertionType,
        data_hash: contentHash,
        data_uri: dataURI,
        declared_amount: declaredAmount.toString(),
        submitted_by: v.address.toLowerCase(),
      })
      .select('id')
      .single();
    if (insErr || !created) {
      logApiError('bordereau/upload', 'assertion_insert_failed', { code: insErr?.code ?? 'unknown' });
      return NextResponse.json({ error: 'assertion persist failed' }, { status: 502 });
    }
    assertionId = created.id;
  }

  const fileIns = await supabase.from('bordereau_files').insert({
    assertion_id: assertionId,
    storage_path: path,
    content_hash: contentHash,
    file_name: file.name,
    content_type: file.type || 'application/octet-stream',
    size_bytes: file.size,
    uploader_addr: v.address.toLowerCase(),
  });
  if (fileIns.error) {
    logApiError('bordereau/upload', 'file_insert_failed', { code: fileIns.error.code ?? 'unknown' });
    return NextResponse.json({ error: 'file metadata insert failed' }, { status: 502 });
  }

  return NextResponse.json({ assertionId, contentHash, path });
}
