/**
 * Governance execution builders — Safe → ProtocolTimelock → protocol.
 *
 * Phase-1 governance routes every OWNER-gated action through the timelock
 * (the Safe is proposer/executor). This module builds, PURELY, everything the
 * signers need to run that path from the Safe UI:
 *
 *   1. the inner protocol call (e.g. ProtocolRoles.grantRole),
 *   2. the TimelockController.schedule(...) calldata wrapping it,
 *   3. the operation id (OZ hashOperation — parity-tested against `cast`),
 *   4. the TimelockController.execute(...) calldata for after the delay,
 *   5. a Safe Transaction-Builder batch JSON (upload in the Safe app).
 *
 * No HTTP, no wallet: encoding + hashing only (viem). The UI page at
 * /app/admin/governance drives it; authority stays entirely on-chain
 * (only timelock proposers can schedule — this is a convenience encoder,
 * not a security boundary).
 */

import {
  encodeFunctionData,
  encodeAbiParameters,
  keccak256,
  toBytes,
  type Hex,
  type Address,
} from 'viem';

// --- Timelock ABI (schedule / execute, single-operation form) ---

const TIMELOCK_ABI = [
  {
    type: 'function',
    name: 'schedule',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'predecessor', type: 'bytes32' },
      { name: 'salt', type: 'bytes32' },
      { name: 'delay', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'predecessor', type: 'bytes32' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

const ACCESS_CONTROL_ABI = [
  {
    type: 'function',
    name: 'grantRole',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revokeRole',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
] as const;

/** Protocol role labels — keccak'd exactly like ProtocolRoles.sol constants. */
export const PROTOCOL_ROLES = [
  'OWNER_ROLE',
  'UNDERWRITING_CURATOR_ROLE',
  'ALLOCATOR_ROLE',
  'SENTINEL_ROLE',
  'CLAIMS_COMMITTEE_ROLE',
  'KYC_OPERATOR_ROLE',
  'AUTHORIZED_CEDANT_ROLE',
  'ORACLE_ROLE',
] as const;
export type ProtocolRoleName = (typeof PROTOCOL_ROLES)[number];

export function roleId(name: ProtocolRoleName): Hex {
  return keccak256(toBytes(name));
}

// --- Operations ---

export interface TimelockOperation {
  /** Human label; also drives the deterministic salt. */
  label: string;
  target: Address;
  value: bigint;
  data: Hex;
  predecessor: Hex;
  salt: Hex;
}

export const ZERO_BYTES32: Hex = `0x${'0'.repeat(64)}`;

/** Deterministic, collision-resistant salt from the operation label. */
export function saltFromLabel(label: string): Hex {
  return keccak256(toBytes(label));
}

/** Inner call: ProtocolRoles.grantRole(role, account). */
export function buildGrantRoleOperation(
  protocolRoles: Address,
  role: ProtocolRoleName,
  account: Address,
): TimelockOperation {
  const label = `grantRole:${role}:${account.toLowerCase()}`;
  return {
    label,
    target: protocolRoles,
    value: 0n,
    data: encodeFunctionData({ abi: ACCESS_CONTROL_ABI, functionName: 'grantRole', args: [roleId(role), account] }),
    predecessor: ZERO_BYTES32,
    salt: saltFromLabel(label),
  };
}

/** Inner call: ProtocolRoles.revokeRole(role, account). */
export function buildRevokeRoleOperation(
  protocolRoles: Address,
  role: ProtocolRoleName,
  account: Address,
): TimelockOperation {
  const label = `revokeRole:${role}:${account.toLowerCase()}`;
  return {
    label,
    target: protocolRoles,
    value: 0n,
    data: encodeFunctionData({ abi: ACCESS_CONTROL_ABI, functionName: 'revokeRole', args: [roleId(role), account] }),
    predecessor: ZERO_BYTES32,
    salt: saltFromLabel(label),
  };
}

/** Arbitrary owner-gated call (target + preencoded calldata). */
export function buildRawOperation(label: string, target: Address, data: Hex): TimelockOperation {
  return { label, target, value: 0n, data, predecessor: ZERO_BYTES32, salt: saltFromLabel(label) };
}

// --- Encoding / hashing ---

/** OZ TimelockController.hashOperation — keccak256(abi.encode(...)). */
export function hashOperation(op: TimelockOperation): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes' },
        { type: 'bytes32' },
        { type: 'bytes32' },
      ],
      [op.target, op.value, op.data, op.predecessor, op.salt],
    ),
  );
}

/** Calldata for TimelockController.schedule(op…, delaySeconds). */
export function encodeSchedule(op: TimelockOperation, delaySeconds: bigint): Hex {
  return encodeFunctionData({
    abi: TIMELOCK_ABI,
    functionName: 'schedule',
    args: [op.target, op.value, op.data, op.predecessor, op.salt, delaySeconds],
  });
}

/** Calldata for TimelockController.execute(op…) — after the delay matured. */
export function encodeExecute(op: TimelockOperation): Hex {
  return encodeFunctionData({
    abi: TIMELOCK_ABI,
    functionName: 'execute',
    args: [op.target, op.value, op.data, op.predecessor, op.salt],
  });
}

// --- Safe Transaction Builder batch ---

export interface SafeBatchTx {
  to: Address;
  value: string;
  data: Hex;
}

export interface SafeBatch {
  version: string;
  chainId: string;
  createdAt: number;
  meta: { name: string; description: string };
  transactions: SafeBatchTx[];
}

/**
 * Safe Transaction-Builder JSON (upload via Apps → Transaction Builder →
 * "Load batch"). One file per step: schedule now, execute after the delay.
 */
export function buildSafeBatch(
  name: string,
  description: string,
  chainId: number,
  txs: SafeBatchTx[],
  createdAt: number,
): SafeBatch {
  return {
    version: '1.0',
    chainId: String(chainId),
    createdAt,
    meta: { name, description },
    transactions: txs,
  };
}

/** Both Safe batches (schedule + execute) for one timelock operation. */
export function buildOperationBatches(
  op: TimelockOperation,
  timelock: Address,
  chainId: number,
  delaySeconds: bigint,
  createdAt: number,
): { id: Hex; schedule: SafeBatch; execute: SafeBatch } {
  return {
    id: hashOperation(op),
    schedule: buildSafeBatch(
      `schedule — ${op.label}`,
      `Timelock schedule (${delaySeconds}s delay). Operation id: ${hashOperation(op)}`,
      chainId,
      [{ to: timelock, value: '0', data: encodeSchedule(op, delaySeconds) }],
      createdAt,
    ),
    execute: buildSafeBatch(
      `execute — ${op.label}`,
      `Timelock execute (run after the delay matured). Operation id: ${hashOperation(op)}`,
      chainId,
      [{ to: timelock, value: '0', data: encodeExecute(op) }],
      createdAt,
    ),
  };
}
