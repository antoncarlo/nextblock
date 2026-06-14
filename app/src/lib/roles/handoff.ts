import { keccak256, toBytes, encodeFunctionData } from 'viem';

/**
 * Pure role-handoff logic (no React, no wagmi): role-id derivation, the
 * KYB-applicant-type -> default-role mapping, address validation, grantRole
 * calldata/Safe-payload encoding and the pure grant-readiness evaluation.
 *
 * Shared by the RoleHandoffPanel UI and the node strip-types smoke script, so
 * it must stay dependency-light (viem only) and erasable-syntax-only (no TS
 * `enum`, no parameter properties).
 *
 * Staging/pilot operational tooling only: it bridges an approved KYB applicant
 * to the on-chain operational role that approval implies. It is NOT Governance
 * Stage A and never touches OWNER_ROLE / DEFAULT_ADMIN_ROLE / VAULT_FACTORY_ROLE.
 */

/**
 * Canonical role identifiers, `keccak256(toBytes('<NAME>'))`. Mirrors
 * contracts/src/ProtocolRoles.sol and useProtocolAccess.ROLE_IDS exactly; the
 * smoke recomputes these independently to guard the mirror.
 */
export const ROLE_ID = {
  OWNER: keccak256(toBytes('OWNER_ROLE')),
  UNDERWRITING_CURATOR: keccak256(toBytes('UNDERWRITING_CURATOR_ROLE')),
  ALLOCATOR: keccak256(toBytes('ALLOCATOR_ROLE')),
  SENTINEL: keccak256(toBytes('SENTINEL_ROLE')),
  CLAIMS_COMMITTEE: keccak256(toBytes('CLAIMS_COMMITTEE_ROLE')),
  PREMIUM_DEPOSITOR: keccak256(toBytes('PREMIUM_DEPOSITOR_ROLE')),
  AUTHORIZED_CEDANT: keccak256(toBytes('AUTHORIZED_CEDANT_ROLE')),
  VAULT_FACTORY: keccak256(toBytes('VAULT_FACTORY_ROLE')),
  KYC_OPERATOR: keccak256(toBytes('KYC_OPERATOR_ROLE')),
  ORACLE: keccak256(toBytes('ORACLE_ROLE')),
} as const;

/** OpenZeppelin AccessControl default admin role = bytes32(0). */
export const DEFAULT_ADMIN_ROLE =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

/**
 * Roles the operator may grant from the UI. Deliberately EXCLUDES
 * OWNER_ROLE, DEFAULT_ADMIN_ROLE (governance-level, admined by
 * DEFAULT_ADMIN_ROLE) and VAULT_FACTORY_ROLE (for factory contracts, not human
 * actors). Every entry below is admined by OWNER_ROLE on ProtocolRoles.
 */
export interface GrantableRole {
  key: string;
  id: `0x${string}`;
  label: string;
  description: string;
}

export const GRANTABLE_ROLES: readonly GrantableRole[] = [
  { key: 'AUTHORIZED_CEDANT', id: ROLE_ID.AUTHORIZED_CEDANT, label: 'Authorized Cedant', description: 'Submit portfolios and claims.' },
  { key: 'UNDERWRITING_CURATOR', id: ROLE_ID.UNDERWRITING_CURATOR, label: 'Underwriting Curator', description: 'Review, approve and activate portfolios and claims.' },
  { key: 'ALLOCATOR', id: ROLE_ID.ALLOCATOR, label: 'Vault Allocator', description: 'Distribute capacity within approved limits.' },
  { key: 'SENTINEL', id: ROLE_ID.SENTINEL, label: 'Sentinel / Risk Guardian', description: 'Pause and dispute; never moves funds.' },
  { key: 'CLAIMS_COMMITTEE', id: ROLE_ID.CLAIMS_COMMITTEE, label: 'Claims Committee', description: 'Off-chain claim approval path.' },
  { key: 'KYC_OPERATOR', id: ROLE_ID.KYC_OPERATOR, label: 'KYC Operator', description: 'Manage whitelist and eligibility.' },
  { key: 'ORACLE', id: ROLE_ID.ORACLE, label: 'Oracle / Attestor', description: 'NAV, bordereau and risk attestations.' },
  { key: 'PREMIUM_DEPOSITOR', id: ROLE_ID.PREMIUM_DEPOSITOR, label: 'Premium Depositor', description: 'Transfer premium USDC into vaults.' },
] as const;

/** Role ids that must never be grantable from this UI. */
export const RESTRICTED_ROLE_IDS: readonly `0x${string}`[] = [
  ROLE_ID.OWNER,
  DEFAULT_ADMIN_ROLE,
  ROLE_ID.VAULT_FACTORY,
];

/** True only for an operational role exposed in GRANTABLE_ROLES. */
export function isGrantableRoleId(id: string): boolean {
  const lower = id.toLowerCase();
  if (RESTRICTED_ROLE_IDS.some(r => r.toLowerCase() === lower)) return false;
  return GRANTABLE_ROLES.some(r => r.id.toLowerCase() === lower);
}

/** Look up a grantable role by its key. */
export function grantableRoleByKey(key: string): GrantableRole | undefined {
  return GRANTABLE_ROLES.find(r => r.key === key);
}

/** KYB applicant types currently encoded by the onboarding form. */
export type KybApplicantType = 'cedant' | 'curator';

/**
 * Default role key implied by a KYB applicant_type. Other pilot actors
 * (committee, sentinel, asset manager) are not encoded by the KYB form and
 * return null, so the operator selects the role manually.
 */
export function defaultRoleKeyForApplicant(applicantType: string | null | undefined): string | null {
  if (applicantType === 'cedant') return 'AUTHORIZED_CEDANT';
  if (applicantType === 'curator') return 'UNDERWRITING_CURATOR';
  return null;
}

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** EVM address shape check (mirrors the KYB schema's address regex). */
export function isValidAddress(value: string | null | undefined): boolean {
  return typeof value === 'string' && EVM_ADDRESS_RE.test(value);
}

/** Minimal local ABI fragment for grantRole calldata encoding (preview/Safe). */
const GRANT_ROLE_ABI = [
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
] as const;

/** abi-encoded ProtocolRoles.grantRole(role, account) calldata. */
export function buildGrantRoleCalldata(roleId: `0x${string}`, account: `0x${string}`): `0x${string}` {
  return encodeFunctionData({ abi: GRANT_ROLE_ABI, functionName: 'grantRole', args: [roleId, account] });
}

/** Safe Transaction Builder-shaped payload (single CALL, value 0). */
export interface SafePayload {
  to: `0x${string}`;
  value: string;
  data: `0x${string}`;
  operation: 0;
}

export function buildSafeGrantRolePayload(
  protocolRoles: `0x${string}`,
  roleId: `0x${string}`,
  account: `0x${string}`,
): SafePayload {
  return { to: protocolRoles, value: '0', data: buildGrantRoleCalldata(roleId, account), operation: 0 };
}

/**
 * Pure grant-readiness evaluation, independent of on-chain authority. The UI
 * additionally gates the direct write on the connected wallet holding
 * OWNER_ROLE; this function only validates the target + selection + duplicate.
 */
export type GrantReadiness = 'invalid-address' | 'no-role' | 'already-granted' | 'ready';

export function evaluateGrant(input: {
  account: string;
  roleId: string | null | undefined;
  alreadyHasRole: boolean;
}): GrantReadiness {
  if (!isValidAddress(input.account)) return 'invalid-address';
  if (!input.roleId || !isGrantableRoleId(input.roleId)) return 'no-role';
  if (input.alreadyHasRole) return 'already-granted';
  return 'ready';
}
