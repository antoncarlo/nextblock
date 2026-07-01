/**
 * Pinata IPFS pinning provider (server-only).
 *
 * Real, not mock: pins bytes/JSON to IPFS through the caller's Pinata account
 * and returns the content-addressed CID. The on-chain `metadataURI` becomes a
 * real `ipfs://<cid>` pointer and the document is genuinely retrievable.
 *
 * Configuration (env, never hardcoded — set in Vercel / .env.local):
 *   - PINATA_JWT      required. Scoped API key JWT from pinata.cloud.
 *   - PINATA_GATEWAY  optional. Dedicated gateway host (e.g.
 *                     "blush-fashionable-limpet-75.mypinata.cloud") for
 *                     retrieval URLs. Falls back to the public gateway.
 *
 * Fail-loud: throws on misconfiguration or HTTP error so the caller decides
 * whether to surface 503 or swallow. The JWT is never logged.
 */

const PIN_FILE_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const PIN_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const AUTH_TEST_URL = 'https://api.pinata.cloud/data/testAuthentication';

export interface PinResult {
  /** IPFS CID (v1). */
  cid: string;
  /** Canonical on-chain pointer: ipfs://<cid>. */
  uri: string;
  /** Dedicated-gateway https URL for retrieval. */
  gatewayUrl: string;
  /** Pinned size in bytes (Pinata-reported, else the input length). */
  size: number;
}

/** True when a Pinata JWT is configured; callers should 503 otherwise. */
export function isPinataConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.PINATA_JWT === 'string' && env.PINATA_JWT.length > 0;
}

function gatewayHost(env: NodeJS.ProcessEnv): string | undefined {
  const raw = env.PINATA_GATEWAY;
  if (!raw) return undefined;
  return raw.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/** Public https retrieval URL for a CID (dedicated gateway when configured). */
export function gatewayUrlFor(cid: string, env: NodeJS.ProcessEnv = process.env): string {
  const host = gatewayHost(env);
  return host ? `https://${host}/ipfs/${cid}` : `https://gateway.pinata.cloud/ipfs/${cid}`;
}

function requireJwt(env: NodeJS.ProcessEnv): string {
  const jwt = env.PINATA_JWT;
  if (!jwt) throw new Error('PINATA_JWT is not set');
  return jwt;
}

/** Verify the configured credential without pinning anything. */
export async function testPinataAuth(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: boolean; reason?: string }> {
  let res: Response;
  try {
    res = await fetch(AUTH_TEST_URL, { headers: { authorization: `Bearer ${requireJwt(env)}` } });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message.slice(0, 200) : 'network' };
  }
  if (!res.ok) return { ok: false, reason: `http ${res.status}` };
  return { ok: true };
}

/** Pin raw bytes to IPFS. Returns the CID + ipfs:// uri + gateway URL. */
export async function pinFileToIpfs(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
  keyvalues: Record<string, string> = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<PinResult> {
  const jwt = requireJwt(env);

  const form = new FormData();
  form.append(
    'file',
    new Blob([bytes as unknown as BlobPart], { type: contentType || 'application/octet-stream' }),
    filename,
  );
  form.append('pinataMetadata', JSON.stringify({ name: filename, keyvalues }));
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  let res: Response;
  try {
    res = await fetch(PIN_FILE_URL, { method: 'POST', headers: { authorization: `Bearer ${jwt}` }, body: form });
  } catch (err) {
    throw new Error(`Pinata pinFile network error: ${err instanceof Error ? err.message.slice(0, 160) : 'unknown'}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Pinata pinFile failed: http ${res.status} ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { IpfsHash: string; PinSize?: number };
  return {
    cid: json.IpfsHash,
    uri: `ipfs://${json.IpfsHash}`,
    gatewayUrl: gatewayUrlFor(json.IpfsHash, env),
    size: json.PinSize ?? bytes.length,
  };
}

/** Pin a JSON manifest to IPFS (e.g. a public, non-confidential integrity record). */
export async function pinJsonToIpfs(
  value: unknown,
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PinResult> {
  const jwt = requireJwt(env);

  let res: Response;
  try {
    res = await fetch(PIN_JSON_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pinataContent: value, pinataMetadata: { name }, pinataOptions: { cidVersion: 1 } }),
    });
  } catch (err) {
    throw new Error(`Pinata pinJSON network error: ${err instanceof Error ? err.message.slice(0, 160) : 'unknown'}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Pinata pinJSON failed: http ${res.status} ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { IpfsHash: string; PinSize?: number };
  return {
    cid: json.IpfsHash,
    uri: `ipfs://${json.IpfsHash}`,
    gatewayUrl: gatewayUrlFor(json.IpfsHash, env),
    size: json.PinSize ?? 0,
  };
}
