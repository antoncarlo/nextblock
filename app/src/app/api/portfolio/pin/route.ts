import { NextRequest, NextResponse } from 'next/server';
import { keccak256Hex } from '@/lib/evidence/hash';
import { verifyCedantAuth } from '@/lib/portfolio/auth';
import { buildDocumentManifest } from '@/lib/portfolio/manifest';
import { isPinataConfigured, pinJsonToIpfs } from '@/lib/ipfs/pinata';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { logApiError } from '@/lib/api-log';

const BUCKET = 'portfolio-documents';
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB — treaty/bordereau bundles

/**
 * CONFIDENTIAL pinning of a portfolio document (SOV / treaty / bordereau).
 *
 * A bordereau carries insured-party data, and anything pinned to IPFS is
 * world-readable to whoever learns the CID. So the document itself never
 * touches IPFS:
 *
 *   - raw bytes             → PRIVATE Supabase bucket `portfolio-documents`
 *                             (same posture as claim evidence: RLS deny-by-default,
 *                             read only via the signed download route)
 *   - public IPFS pin       → a small integrity MANIFEST (hash + non-sensitive
 *                             metadata, see lib/portfolio/manifest.ts)
 *   - on-chain documentHash → keccak256 of the REAL bytes, re-derived server-side
 *
 * Response shape is unchanged for the UI: { documentHash, metadataURI, cid,
 * gatewayUrl, size } — metadataURI now points at the manifest, not the file.
 * Idempotent: re-uploading identical bytes returns the already-recorded
 * manifest instead of double-pinning. Access is gated by a wallet signature
 * over `portfolio:pin:<documentHash>` verified against AUTHORIZED_CEDANT_ROLE
 * on-chain. Fail-closed: 503 when Pinata or the storage backend is missing.
 */
export async function POST(request: NextRequest) {
  if (!isPinataConfigured()) {
    return NextResponse.json({ error: 'pinning backend unavailable (PINATA_JWT not set)' }, { status: 503 });
  }
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'document storage unavailable' }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid multipart form' }, { status: 400 });
  }

  const file = form.get('file');
  const address = form.get('address');
  const timestamp = form.get('timestamp');
  const signature = form.get('signature');
  if (
    !(file instanceof File) ||
    typeof address !== 'string' ||
    typeof timestamp !== 'string' ||
    typeof signature !== 'string'
  ) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: 'empty file' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'file exceeds 25 MB' }, { status: 413 });
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: 'bad address' }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const documentHash = keccak256Hex(bytes);

  const auth = await verifyCedantAuth(`portfolio:pin:${documentHash}`, {
    address: address as `0x${string}`,
    timestamp: Number(timestamp),
    signature: signature as `0x${string}`,
  });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Idempotency: identical bytes → identical hash → return the existing record.
  const { data: existing } = await supabase
    .from('portfolio_documents')
    .select('manifest_cid, manifest_uri, size_bytes')
    .eq('document_hash', documentHash)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      documentHash,
      metadataURI: existing.manifest_uri,
      cid: existing.manifest_cid,
      size: existing.size_bytes,
      confidential: true,
      deduplicated: true,
    });
  }

  const fileName = file.name || 'portfolio-document';
  const contentType = file.type || 'application/octet-stream';
  const storagePath = `${documentHash}/${crypto.randomUUID()}-${fileName}`;

  const up = await supabase.storage.from(BUCKET).upload(storagePath, bytes, { contentType, upsert: false });
  if (up.error) {
    logApiError('portfolio/pin', 'storage_upload_error', { code: up.error.name });
    return NextResponse.json({ error: 'document storage error' }, { status: 502 });
  }

  try {
    const manifest = buildDocumentManifest({
      documentHash,
      fileName,
      contentType,
      sizeBytes: bytes.length,
      uploader: auth.address,
      uploadedAt: new Date(),
    });
    const pinned = await pinJsonToIpfs(manifest, `portfolio-manifest-${documentHash.slice(0, 10)}`);

    const { error: insErr } = await supabase.from('portfolio_documents').insert({
      document_hash: documentHash,
      storage_path: storagePath,
      file_name: fileName,
      content_type: contentType,
      size_bytes: bytes.length,
      uploader_addr: auth.address.toLowerCase(),
      manifest_cid: pinned.cid,
      manifest_uri: pinned.uri,
    });
    if (insErr) {
      logApiError('portfolio/pin', 'metadata_insert_error', { code: insErr.code ?? 'unknown' });
      return NextResponse.json({ error: 'document metadata error' }, { status: 502 });
    }

    return NextResponse.json({
      documentHash,
      metadataURI: pinned.uri,
      cid: pinned.cid,
      gatewayUrl: pinned.gatewayUrl,
      size: bytes.length,
      confidential: true,
    });
  } catch (err) {
    // Manifest pin failed: remove the orphaned object so a retry starts clean.
    try {
      await supabase.storage.from(BUCKET).remove([storagePath]);
    } catch {
      // best-effort cleanup only
    }
    logApiError('portfolio/pin', 'manifest_pin_failed', { code: err instanceof Error ? err.name : 'unknown' });
    return NextResponse.json({ error: 'manifest pinning failed' }, { status: 502 });
  }
}
