import { createPublicClient, http, verifyMessage, keccak256, toBytes } from 'viem';
import { baseSepolia } from 'viem/chains';
import { NEXTBLOCK_ADDRESSES, NEXTBLOCK_CHAIN_ID } from '@/config/generated/addressBook';
import { CEDANT_AUTH_WINDOW_SECONDS, cedantAuthMessage } from './authMessage';

export { CEDANT_AUTH_WINDOW_SECONDS, cedantAuthMessage };

/**
 * SERVER-ONLY cedant authentication for the portfolio document-pin API.
 *
 * Trust model (same posture as lib/kyb/auth): the caller signs
 * cedantAuthMessage(action, timestamp) (EIP-191). The server verifies the
 * signature and then checks ON-CHAIN that the wallet holds
 * AUTHORIZED_CEDANT_ROLE or OWNER_ROLE on ProtocolRoles — the same role the
 * PortfolioRegistry requires to actually submit the portfolio. This keeps the
 * shared Pinata quota gated to real, authorized cedants. Read-only chain
 * access; never signs or sends transactions.
 */

const HAS_ROLE_ABI = [
  {
    type: 'function',
    name: 'hasRole',
    stateMutability: 'view',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const AUTHORIZED_CEDANT_ROLE = keccak256(toBytes('AUTHORIZED_CEDANT_ROLE'));
const UNDERWRITING_CURATOR_ROLE = keccak256(toBytes('UNDERWRITING_CURATOR_ROLE'));
const OWNER_ROLE = keccak256(toBytes('OWNER_ROLE'));

function getRpcUrl(): string {
  return process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
}

export interface CedantAuthInput {
  address: `0x${string}`;
  timestamp: number;
  signature: `0x${string}`;
}

export type CedantAuthResult =
  | { ok: true; address: `0x${string}` }
  | { ok: false; status: 401 | 403; error: string };

/** Shared step: timestamp window + EIP-191 signature over cedantAuthMessage. */
async function verifySignedAction(action: string, auth: CedantAuthInput): Promise<CedantAuthResult> {
  const now = Math.floor(Date.now() / 1000);
  if (auth.timestamp > now + 60 || now - auth.timestamp > CEDANT_AUTH_WINDOW_SECONDS) {
    return { ok: false, status: 401, error: 'signature expired' };
  }

  let signatureValid = false;
  try {
    signatureValid = await verifyMessage({
      address: auth.address,
      message: cedantAuthMessage(action, auth.timestamp),
      signature: auth.signature,
    });
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    return { ok: false, status: 401, error: 'invalid signature' };
  }
  return { ok: true, address: auth.address };
}

export async function verifyCedantAuth(action: string, auth: CedantAuthInput): Promise<CedantAuthResult> {
  const signed = await verifySignedAction(action, auth);
  if (!signed.ok) return signed;

  const client = createPublicClient({ chain: baseSepolia, transport: http(getRpcUrl()) });
  const protocolRoles = NEXTBLOCK_ADDRESSES.protocolRoles as `0x${string}`;
  try {
    const [isCedant, isOwner] = await Promise.all([
      client.readContract({
        address: protocolRoles,
        abi: HAS_ROLE_ABI,
        functionName: 'hasRole',
        args: [AUTHORIZED_CEDANT_ROLE, auth.address],
      }),
      client.readContract({
        address: protocolRoles,
        abi: HAS_ROLE_ABI,
        functionName: 'hasRole',
        args: [OWNER_ROLE, auth.address],
      }),
    ]);
    if (!isCedant && !isOwner) {
      return {
        ok: false,
        status: 403,
        error: `wallet lacks AUTHORIZED_CEDANT_ROLE/OWNER_ROLE on ProtocolRoles (chain ${NEXTBLOCK_CHAIN_ID})`,
      };
    }
  } catch {
    return { ok: false, status: 403, error: 'on-chain role check unavailable' };
  }

  return { ok: true, address: auth.address };
}

/**
 * Read access to a CONFIDENTIAL portfolio document: the reviewing roles
 * (Underwriting Curator / Owner, checked on-chain) or the wallet that uploaded
 * it (`uploaderAddr`, recorded at upload after passing the cedant check).
 */
export async function verifyDocumentAccess(
  action: string,
  auth: CedantAuthInput,
  uploaderAddr: string,
): Promise<CedantAuthResult> {
  const signed = await verifySignedAction(action, auth);
  if (!signed.ok) return signed;

  if (auth.address.toLowerCase() === uploaderAddr.toLowerCase()) {
    return { ok: true, address: auth.address };
  }

  const client = createPublicClient({ chain: baseSepolia, transport: http(getRpcUrl()) });
  const protocolRoles = NEXTBLOCK_ADDRESSES.protocolRoles as `0x${string}`;
  try {
    const [isCurator, isOwner] = await Promise.all([
      client.readContract({
        address: protocolRoles,
        abi: HAS_ROLE_ABI,
        functionName: 'hasRole',
        args: [UNDERWRITING_CURATOR_ROLE, auth.address],
      }),
      client.readContract({
        address: protocolRoles,
        abi: HAS_ROLE_ABI,
        functionName: 'hasRole',
        args: [OWNER_ROLE, auth.address],
      }),
    ]);
    if (!isCurator && !isOwner) {
      return {
        ok: false,
        status: 403,
        error: `wallet is neither the uploader nor holds UNDERWRITING_CURATOR_ROLE/OWNER_ROLE (chain ${NEXTBLOCK_CHAIN_ID})`,
      };
    }
  } catch {
    return { ok: false, status: 403, error: 'on-chain role check unavailable' };
  }

  return { ok: true, address: auth.address };
}
