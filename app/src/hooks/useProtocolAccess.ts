'use client';

import { useAccount, useReadContracts } from 'wagmi';
import { keccak256, toBytes } from 'viem';
import { useAddresses } from './useAddresses';
import {
  PROTOCOL_ROLES_ABI,
  COMPLIANCE_REGISTRY_ABI,
  isDeployed,
} from '@/config/contracts';

/**
 * Canonical protocol role identifiers (keccak256 of the on-chain constants).
 * Must mirror contracts/src/ProtocolRoles.sol.
 */
export const ROLE_IDS = {
  OWNER: keccak256(toBytes('OWNER_ROLE')),
  UNDERWRITING_CURATOR: keccak256(toBytes('UNDERWRITING_CURATOR_ROLE')),
  ALLOCATOR: keccak256(toBytes('ALLOCATOR_ROLE')),
  SENTINEL: keccak256(toBytes('SENTINEL_ROLE')),
  CLAIMS_COMMITTEE: keccak256(toBytes('CLAIMS_COMMITTEE_ROLE')),
  PREMIUM_DEPOSITOR: keccak256(toBytes('PREMIUM_DEPOSITOR_ROLE')),
  AUTHORIZED_CEDANT: keccak256(toBytes('AUTHORIZED_CEDANT_ROLE')),
  KYC_OPERATOR: keccak256(toBytes('KYC_OPERATOR_ROLE')),
} as const;

export type ProtocolAccessStatus = 'onchain' | 'unavailable' | 'loading' | 'disconnected';

export interface ProtocolAccess {
  /**
   * Data source state:
   * - 'onchain'      -> roles/compliance read from deployed contracts
   * - 'unavailable'  -> ProtocolRoles/ComplianceRegistry NOT deployed on this
   *                     chain. The UI must show "Unavailable", never fake roles.
   * - 'loading'      -> reads in flight
   * - 'disconnected' -> no wallet connected
   */
  status: ProtocolAccessStatus;
  isOwner: boolean;
  isCurator: boolean;
  isCedant: boolean;
  isCommittee: boolean;
  isSentinel: boolean;
  isAllocator: boolean;
  /** ComplianceRegistry.canReceive: eligible to hold nbUSDC (Institutional LP). */
  isCompliantLP: boolean;
}

const NONE: Omit<ProtocolAccess, 'status'> = {
  isOwner: false,
  isCurator: false,
  isCedant: false,
  isCommittee: false,
  isSentinel: false,
  isAllocator: false,
  isCompliantLP: false,
};

/**
 * Reads the connected wallet's protocol roles from ProtocolRoles and its LP
 * eligibility from ComplianceRegistry. SOLE source of role truth for the UI:
 * no frontend whitelist is consulted. When the institutional contracts are not
 * deployed on the active chain, status is 'unavailable' and every flag is
 * false -- the UI must surface that state instead of inventing access.
 */
export function useProtocolAccess(): ProtocolAccess {
  const { address, isConnected } = useAccount();
  const addresses = useAddresses();

  const rolesDeployed = isDeployed(addresses.protocolRoles);
  const complianceDeployed = isDeployed(addresses.complianceRegistry);

  const roleKeys = [
    ROLE_IDS.OWNER,
    ROLE_IDS.UNDERWRITING_CURATOR,
    ROLE_IDS.AUTHORIZED_CEDANT,
    ROLE_IDS.CLAIMS_COMMITTEE,
    ROLE_IDS.SENTINEL,
    ROLE_IDS.ALLOCATOR,
  ] as const;

  const result = useReadContracts({
    contracts:
      address && rolesDeployed
        ? [
            ...roleKeys.map((role) => ({
              address: addresses.protocolRoles,
              abi: PROTOCOL_ROLES_ABI,
              functionName: 'hasRole' as const,
              args: [role, address] as const,
            })),
            ...(complianceDeployed
              ? [
                  {
                    address: addresses.complianceRegistry,
                    abi: COMPLIANCE_REGISTRY_ABI,
                    functionName: 'canReceive' as const,
                    args: [address] as const,
                  },
                ]
              : []),
          ]
        : [],
    query: { enabled: !!address && rolesDeployed },
  });

  if (!isConnected || !address) return { status: 'disconnected', ...NONE };
  if (!rolesDeployed) return { status: 'unavailable', ...NONE };
  if (result.isLoading) return { status: 'loading', ...NONE };

  const flag = (i: number) => result.data?.[i]?.status === 'success' && result.data[i].result === true;

  return {
    status: 'onchain',
    isOwner: flag(0),
    isCurator: flag(1),
    isCedant: flag(2),
    isCommittee: flag(3),
    isSentinel: flag(4),
    isAllocator: flag(5),
    isCompliantLP: complianceDeployed ? flag(6) : false,
  };
}
