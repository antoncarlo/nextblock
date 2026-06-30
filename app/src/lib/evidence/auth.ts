import { createPublicClient, http, verifyMessage, keccak256, toBytes } from 'viem';
import { baseSepolia } from 'viem/chains';
import { NEXTBLOCK_ADDRESSES, NEXTBLOCK_CHAIN_ID } from '@/config/generated/addressBook';
import { operatorAuthMessage, isTimestampWithinWindow } from '@/lib/kyb/schema';

/**
 * SERVER-ONLY authorization for claim evidence.
 *
 * Same trust model as KYB (EIP-191 signature + on-chain check), specialized:
 *  - reviewers must hold CLAIMS_COMMITTEE_ROLE / SENTINEL_ROLE / OWNER_ROLE;
 *  - the uploader must be the claim's on-chain `claimant`.
 * All chain access is READ-ONLY (eth_call). Never trusts a client header.
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

const GET_CLAIM_ABI = [
  {
    type: 'function',
    name: 'getClaim',
    stateMutability: 'view',
    inputs: [{ name: 'claimId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'claimId', type: 'uint256' },
          { name: 'portfolioId', type: 'uint256' },
          { name: 'vault', type: 'address' },
          { name: 'claimant', type: 'address' },
          { name: 'requestedAmount', type: 'uint256' },
          { name: 'approvedAmount', type: 'uint256' },
          { name: 'claimType', type: 'uint8' },
          { name: 'status', type: 'uint8' },
          { name: 'evidenceHash', type: 'bytes32' },
          { name: 'submittedAt', type: 'uint64' },
          { name: 'challengeDeadline', type: 'uint64' },
          { name: 'frozen', type: 'bool' },
          { name: 'receiptId', type: 'uint256' },
        ],
      },
    ],
  },
] as const;

const CLAIMS_COMMITTEE_ROLE = keccak256(toBytes('CLAIMS_COMMITTEE_ROLE'));
const SENTINEL_ROLE = keccak256(toBytes('SENTINEL_ROLE'));
const OWNER_ROLE = keccak256(toBytes('OWNER_ROLE'));

function rpcUrl(): string {
  return process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
}
function publicClient() {
  return createPublicClient({ chain: baseSepolia, transport: http(rpcUrl()) });
}

export interface EvidenceAuthInput {
  address: `0x${string}`;
  timestamp: number;
  signature: `0x${string}`;
  nonce?: string;
}

export type EvidenceAuthResult =
  | { ok: true; address: `0x${string}` }
  | { ok: false; status: 401 | 403; error: string };

async function verifySignature(action: string, auth: EvidenceAuthInput): Promise<boolean> {
  if (!isTimestampWithinWindow(auth.timestamp, Math.floor(Date.now() / 1000))) return false;
  try {
    return await verifyMessage({
      address: auth.address,
      message: operatorAuthMessage(action, auth.timestamp, auth.nonce),
      signature: auth.signature,
    });
  } catch {
    return false;
  }
}

/** Reviewer: Claims Committee / Sentinel / Owner on ProtocolRoles. */
export async function verifyClaimReviewer(action: string, auth: EvidenceAuthInput): Promise<EvidenceAuthResult> {
  if (!(await verifySignature(action, auth))) return { ok: false, status: 401, error: 'invalid or expired signature' };
  const client = publicClient();
  const roles = NEXTBLOCK_ADDRESSES.protocolRoles as `0x${string}`;
  try {
    const [committee, sentinel, owner] = await Promise.all(
      [CLAIMS_COMMITTEE_ROLE, SENTINEL_ROLE, OWNER_ROLE].map((role) =>
        client.readContract({ address: roles, abi: HAS_ROLE_ABI, functionName: 'hasRole', args: [role, auth.address] }),
      ),
    );
    if (!committee && !sentinel && !owner) {
      return {
        ok: false,
        status: 403,
        error: `wallet lacks CLAIMS_COMMITTEE/SENTINEL/OWNER role (chain ${NEXTBLOCK_CHAIN_ID})`,
      };
    }
  } catch {
    return { ok: false, status: 403, error: 'on-chain role check unavailable' };
  }
  return { ok: true, address: auth.address };
}

/** Uploader: the on-chain claimant of `claimId`. */
export async function verifyClaimUploader(
  action: string,
  claimId: bigint,
  auth: EvidenceAuthInput,
): Promise<EvidenceAuthResult> {
  if (!(await verifySignature(action, auth))) return { ok: false, status: 401, error: 'invalid or expired signature' };
  const client = publicClient();
  const claimManager = NEXTBLOCK_ADDRESSES.claimManager as `0x${string}`;
  try {
    const claim = await client.readContract({
      address: claimManager,
      abi: GET_CLAIM_ABI,
      functionName: 'getClaim',
      args: [claimId],
    });
    if (claim.claimant.toLowerCase() !== auth.address.toLowerCase()) {
      return { ok: false, status: 403, error: 'signer is not the claimant of this claim' };
    }
  } catch {
    return { ok: false, status: 403, error: 'claim lookup unavailable' };
  }
  return { ok: true, address: auth.address };
}
