import { NextRequest, NextResponse } from 'next/server';
import { keccak256Hex } from '@/lib/evidence/hash';
import { verifyCedantAuth } from '@/lib/portfolio/auth';
import { isPinataConfigured, pinFileToIpfs } from '@/lib/ipfs/pinata';
import { logApiError } from '@/lib/api-log';

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB — treaty/bordereau bundles

/**
 * Pin a portfolio document bundle (SOV / treaty / bordereau) to IPFS and return
 * the REAL on-chain integrity values the cedant submits to PortfolioRegistry:
 *
 *   - documentHash = keccak256(actual file bytes)  (tamper-evident, verifiable)
 *   - metadataURI  = ipfs://<cid>                   (real, retrievable pointer)
 *
 * This replaces the mock where the cedant typed a URI and a reference string
 * that was hashed. Access is gated by a wallet signature over
 * `portfolio:pin:<documentHash>` verified against AUTHORIZED_CEDANT_ROLE
 * on-chain (the same role PortfolioRegistry.submitPortfolio requires), so the
 * shared Pinata quota cannot be abused. Fail-closed: 503 when Pinata is not
 * configured (no silent fake pin).
 *
 * NOTE (confidentiality): treaty documents are sensitive. IPFS content is
 * world-readable to anyone who learns the CID. For confidential bundles, pin an
 * encrypted blob or a non-sensitive manifest instead — the documentHash stays
 * the fingerprint of the real bytes either way.
 */
export async function POST(request: NextRequest) {
  if (!isPinataConfigured()) {
    return NextResponse.json({ error: 'pinning backend unavailable (PINATA_JWT not set)' }, { status: 503 });
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

  try {
    const pinned = await pinFileToIpfs(bytes, file.name || 'portfolio-document', file.type || 'application/octet-stream', {
      documentHash,
      cedant: auth.address,
    });
    return NextResponse.json({
      documentHash,
      metadataURI: pinned.uri,
      cid: pinned.cid,
      gatewayUrl: pinned.gatewayUrl,
      size: pinned.size,
    });
  } catch (err) {
    logApiError('portfolio/pin', 'pin_failed', { code: err instanceof Error ? err.name : 'unknown' });
    return NextResponse.json({ error: 'pinning failed' }, { status: 502 });
  }
}
