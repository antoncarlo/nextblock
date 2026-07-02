import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { verifyDocumentAccess } from '@/lib/portfolio/auth';
import { logApiError } from '@/lib/api-log';

const BUCKET = 'portfolio-documents';
const SIGNED_URL_TTL_SEC = 60;

const schema = z.object({
  documentHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  timestamp: z.number(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

/**
 * Issue a short-lived signed URL for one CONFIDENTIAL portfolio document,
 * looked up by its on-chain documentHash. Authorized for the Underwriting
 * Curator / Owner (due-diligence: download, keccak256, compare with the
 * on-chain hash) or the uploading cedant. The bucket is private; this is the
 * only read path. Same posture as the claim-evidence download route.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'document backend unavailable' }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  const { documentHash, address, timestamp, signature } = parsed.data;

  const hash = documentHash.toLowerCase();
  const { data: row, error: selErr } = await supabase
    .from('portfolio_documents')
    .select('storage_path, uploader_addr, file_name')
    .eq('document_hash', hash)
    .maybeSingle();
  if (selErr || !row) return NextResponse.json({ error: 'document not found' }, { status: 404 });

  const auth = await verifyDocumentAccess(
    `portfolio:download:${hash}`,
    { address: address as `0x${string}`, timestamp, signature: signature as `0x${string}` },
    row.uploader_addr as string,
  );
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: signed, error: urlErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path as string, SIGNED_URL_TTL_SEC);
  if (urlErr || !signed) {
    logApiError('portfolio/document', 'signed_url_error', { code: urlErr?.name ?? 'unknown' });
    return NextResponse.json({ error: 'could not sign url' }, { status: 502 });
  }
  return NextResponse.json({ url: signed.signedUrl, fileName: row.file_name, expiresInSec: SIGNED_URL_TTL_SEC });
}
