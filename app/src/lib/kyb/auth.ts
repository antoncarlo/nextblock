import { createPublicClient, http, verifyMessage, keccak256, toBytes } from 'viem';
import { baseSepolia } from 'viem/chains';
import { NEXTBLOCK_ADDRESSES, NEXTBLOCK_CHAIN_ID } from '@/config/generated/addressBook';
import {
  operatorAuthMessage,
  isTimestampWithinWindow,
} from './schema';

/**
 * SERVER-ONLY operator authentication for the KYB review API.
 *
 * Trust model: the caller proves control of a wallet by signing
 * operatorAuthMessage(action, timestamp) (EIP-191 personal_sign). The server
 * then verifies ON-CHAIN that the wallet holds KYC_OPERATOR_ROLE or
 * OWNER_ROLE on ProtocolRoles (canonical RBAC). No client-supplied header is
 * trusted without a valid signature.
 *
 * Replay protection: review transitions bind a server-issued single-use
 * nonce inside the signed message (consumed by the route after this
 * verification succeeds). The read-only list flow still uses the timestamp
 * window alone; its exposure is bounded to repeated reads.
 *
 * All chain access here is READ-ONLY (eth_call). This module never signs nor
 * sends transactions.
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

const KYC_OPERATOR_ROLE = keccak256(toBytes('KYC_OPERATOR_ROLE'));
const OWNER_ROLE = keccak256(toBytes('OWNER_ROLE'));

function getRpcUrl(): string {
  return process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
}

export interface OperatorAuthInput {
  address: `0x${string}`;
  timestamp: number;
  signature: `0x${string}`;
  /** Server-issued single-use nonce; when present it must be part of the
   *  signed message and the caller consumes it after verification. */
  nonce?: string;
}

export type OperatorAuthResult =
  | { ok: true; address: `0x${string}` }
  | { ok: false; status: 401 | 403; error: string };

export async function verifyOperatorAuth(
  action: string,
  auth: OperatorAuthInput,
): Promise<OperatorAuthResult> {
  const now = Math.floor(Date.now() / 1000);
  if (!isTimestampWithinWindow(auth.timestamp, now)) {
    return { ok: false, status: 401, error: 'signature expired' };
  }

  const message = operatorAuthMessage(action, auth.timestamp, auth.nonce);
  let signatureValid = false;
  try {
    signatureValid = await verifyMessage({
      address: auth.address,
      message,
      signature: auth.signature,
    });
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    return { ok: false, status: 401, error: 'invalid signature' };
  }

  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(getRpcUrl()),
  });

  const protocolRoles = NEXTBLOCK_ADDRESSES.protocolRoles as `0x${string}`;
  try {
    const [isOperator, isOwner] = await Promise.all([
      client.readContract({
        address: protocolRoles,
        abi: HAS_ROLE_ABI,
        functionName: 'hasRole',
        args: [KYC_OPERATOR_ROLE, auth.address],
      }),
      client.readContract({
        address: protocolRoles,
        abi: HAS_ROLE_ABI,
        functionName: 'hasRole',
        args: [OWNER_ROLE, auth.address],
      }),
    ]);
    if (!isOperator && !isOwner) {
      return {
        ok: false,
        status: 403,
        error: `wallet lacks KYC_OPERATOR_ROLE/OWNER_ROLE on ProtocolRoles (chain ${NEXTBLOCK_CHAIN_ID})`,
      };
    }
  } catch {
    // Fail closed: if the on-chain check cannot run, nobody is an operator.
    return { ok: false, status: 403, error: 'on-chain role check unavailable' };
  }

  return { ok: true, address: auth.address };
}
