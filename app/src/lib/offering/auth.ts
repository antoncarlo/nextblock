import { createPublicClient, http, verifyMessage, keccak256, toBytes } from 'viem';
import { baseSepolia } from 'viem/chains';
import { NEXTBLOCK_ADDRESSES, NEXTBLOCK_CHAIN_ID } from '@/config/generated/addressBook';
import { operatorAuthMessage, isTimestampWithinWindow } from '@/lib/kyb/schema';

/**
 * SERVER-ONLY authorization for vault offering terms.
 *
 * Same trust model as claim evidence (EIP-191 signature + on-chain role
 * check, read-only eth_call): offering terms are the vault's commercial
 * metadata, so the writer must hold UNDERWRITING_CURATOR_ROLE (or OWNER_ROLE)
 * on ProtocolRoles. The UI is never the security boundary.
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

const UNDERWRITING_CURATOR_ROLE = keccak256(toBytes('UNDERWRITING_CURATOR_ROLE'));
const OWNER_ROLE = keccak256(toBytes('OWNER_ROLE'));

function rpcUrl(): string {
  return process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
}

export interface OfferingAuthInput {
  address: `0x${string}`;
  timestamp: number;
  signature: `0x${string}`;
  nonce?: string;
}

export type OfferingAuthResult =
  | { ok: true; address: `0x${string}` }
  | { ok: false; status: 401 | 403; error: string };

/** Curator/Owner gate for writes; action binds the signature to the payload. */
export async function verifyOfferingCurator(
  action: string,
  auth: OfferingAuthInput,
): Promise<OfferingAuthResult> {
  if (!isTimestampWithinWindow(auth.timestamp, Math.floor(Date.now() / 1000))) {
    return { ok: false, status: 401, error: 'expired auth timestamp' };
  }
  let signatureOk = false;
  try {
    signatureOk = await verifyMessage({
      address: auth.address,
      message: operatorAuthMessage(action, auth.timestamp, auth.nonce),
      signature: auth.signature,
    });
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return { ok: false, status: 401, error: 'invalid signature' };

  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl()) });
  const roles = NEXTBLOCK_ADDRESSES.protocolRoles as `0x${string}`;
  try {
    const [curator, owner] = await Promise.all(
      [UNDERWRITING_CURATOR_ROLE, OWNER_ROLE].map((role) =>
        client.readContract({
          address: roles,
          abi: HAS_ROLE_ABI,
          functionName: 'hasRole',
          args: [role, auth.address],
        }),
      ),
    );
    if (!curator && !owner) {
      return {
        ok: false,
        status: 403,
        error: `wallet lacks UNDERWRITING_CURATOR/OWNER role (chain ${NEXTBLOCK_CHAIN_ID})`,
      };
    }
  } catch {
    return { ok: false, status: 403, error: 'on-chain role check unavailable' };
  }
  return { ok: true, address: auth.address };
}
