import { encodeFunctionData } from 'viem';

/**
 * Pure compliance/whitelist logic (no React, no wagmi): address validation,
 * ComplianceRegistry.setWhitelist calldata/Safe-payload encoding and the pure
 * readiness evaluation for the LP whitelist admin action.
 *
 * Shared by the WhitelistPanel UI and the node strip-types smoke script, so it
 * must stay dependency-light (viem only) and erasable-syntax-only (no TS enum).
 *
 * Staging/pilot operator tooling: it toggles the ComplianceRegistry whitelist
 * flag that gates Institutional LP eligibility (canReceive). The on-chain call
 * is restricted to KYC_OPERATOR_ROLE; this module never bypasses that — it only
 * builds the call and evaluates UI readiness.
 */

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** EVM address shape check (mirrors the rest of the codebase). */
export function isValidAddress(value: string | null | undefined): boolean {
  return typeof value === 'string' && EVM_ADDRESS_RE.test(value);
}

/** Minimal local ABI fragment for setWhitelist calldata encoding (preview/Safe). */
const SET_WHITELIST_ABI = [
  {
    type: 'function',
    name: 'setWhitelist',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'allowed', type: 'bool' },
    ],
    outputs: [],
  },
] as const;

/** abi-encoded ComplianceRegistry.setWhitelist(user, allowed) calldata. */
export function buildSetWhitelistCalldata(user: `0x${string}`, allowed: boolean): `0x${string}` {
  return encodeFunctionData({ abi: SET_WHITELIST_ABI, functionName: 'setWhitelist', args: [user, allowed] });
}

/** Safe Transaction Builder-shaped payload (single CALL, value 0). */
export interface SafePayload {
  to: `0x${string}`;
  value: string;
  data: `0x${string}`;
  operation: 0;
}

export function buildSafeSetWhitelistPayload(
  complianceRegistry: `0x${string}`,
  user: `0x${string}`,
  allowed: boolean,
): SafePayload {
  return {
    to: complianceRegistry,
    value: '0',
    data: buildSetWhitelistCalldata(user, allowed),
    operation: 0,
  };
}

/**
 * Pure readiness for the DIRECT setWhitelist write, in priority order. The UI
 * additionally gates on the connected wallet holding KYC_OPERATOR_ROLE on-chain
 * (passed as isAuthorizedOperator); this function only sequences the checks.
 *
 * `currentWhitelisted` is the raw whitelist flag the call toggles (NOT the
 * effective canReceive, which also depends on block/KYC-expiry/jurisdiction):
 * setting the flag to its current value would be a no-op -> 'already'.
 */
export type WhitelistReadiness =
  | 'invalid-address'
  | 'wrong-chain'
  | 'insufficient-permission'
  | 'already'
  | 'ready';

export function evaluateWhitelist(input: {
  targetAddress: string;
  currentWhitelisted: boolean;
  allowed: boolean;
  isAuthorizedOperator: boolean;
  isCorrectChain: boolean;
}): WhitelistReadiness {
  if (!isValidAddress(input.targetAddress)) return 'invalid-address';
  if (!input.isCorrectChain) return 'wrong-chain';
  if (!input.isAuthorizedOperator) return 'insufficient-permission';
  if (input.currentWhitelisted === input.allowed) return 'already';
  return 'ready';
}
