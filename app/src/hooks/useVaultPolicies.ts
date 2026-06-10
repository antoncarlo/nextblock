'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { INSURANCE_VAULT_ABI, POLICY_REGISTRY_ABI } from '@/config/contracts';
import { POLL_INTERVAL } from '@/config/constants';
import { useAddresses } from './useAddresses';

/**
 * Vault-level policy data from getVaultPolicy().
 */
export interface VaultPolicyData {
  allocationWeight: bigint;
  premium: bigint;
  earnedPremium: bigint;
  coverage: bigint;
  duration: bigint;
  startTime: bigint;
  timeRemaining: bigint;
  claimed: boolean;
  expired: boolean;
}

/**
 * Global policy data from PolicyRegistry.getPolicy().
 */
export interface GlobalPolicyData {
  id: bigint;
  name: string;
  verificationType: number;
  coverageAmount: bigint;
  premiumAmount: bigint;
  duration: bigint;
  startTime: bigint;
  insurer: `0x${string}`;
  triggerThreshold: bigint;
  status: number;
}

/**
 * Combined policy data for display.
 */
export interface CombinedPolicyData {
  policyId: bigint;
  global: GlobalPolicyData;
  vault: VaultPolicyData;
}

/**
 * Fetch policy IDs for a vault.
 */
export function useVaultPolicyIds(vaultAddress: `0x${string}` | undefined) {
  return useReadContract({
    address: vaultAddress,
    abi: INSURANCE_VAULT_ABI,
    functionName: 'getPolicyIds',
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: !!vaultAddress,
    },
  });
}

/**
 * Fetch vault-specific policy data for all policies in a vault.
 */
export function useVaultPoliciesData(
  vaultAddress: `0x${string}` | undefined,
  policyIds: readonly bigint[] | undefined,
) {
  const contracts = (policyIds ?? []).map((policyId) => ({
    address: vaultAddress!,
    abi: INSURANCE_VAULT_ABI,
    functionName: 'getVaultPolicy' as const,
    args: [policyId] as const,
  }));

  return useReadContracts({
    contracts,
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: !!vaultAddress && !!policyIds && policyIds.length > 0,
    },
  });
}

/**
 * Fetch global policy data from PolicyRegistry for multiple policies.
 */
export function useGlobalPoliciesData(
  policyIds: readonly bigint[] | undefined,
) {
  const addresses = useAddresses();
  const contracts = (policyIds ?? []).map((policyId) => ({
    address: addresses.policyRegistry,
    abi: POLICY_REGISTRY_ABI,
    functionName: 'getPolicy' as const,
    args: [policyId] as const,
  }));

  return useReadContracts({
    contracts,
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled:
        !!policyIds &&
        policyIds.length > 0 &&
        addresses.policyRegistry !== '0x0000000000000000000000000000000000000000',
    },
  });
}

/**
 * Combined hook: fetch all policy data for a vault (vault-level + global).
 */
export function useVaultPolicies(vaultAddress: `0x${string}` | undefined) {
  const { data: policyIds, isLoading: idsLoading } = useVaultPolicyIds(vaultAddress);
  const { data: vaultPolicies, isLoading: vaultLoading } = useVaultPoliciesData(
    vaultAddress,
    policyIds,
  );
  const { data: globalPolicies, isLoading: globalLoading } = useGlobalPoliciesData(
    policyIds,
  );

  const isLoading = idsLoading || vaultLoading || globalLoading;

  const combined: CombinedPolicyData[] = [];

  if (policyIds && vaultPolicies && globalPolicies) {
    for (let i = 0; i < policyIds.length; i++) {
      const vp = vaultPolicies[i];
      const gp = globalPolicies[i];

      if (vp.status === 'success' && vp.result && gp.status === 'success' && gp.result) {
        const vaultResult = vp.result as unknown as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean];
        const globalResult = gp.result as unknown as {
          id: bigint;
          name: string;
          verificationType: number;
          coverageAmount: bigint;
          premiumAmount: bigint;
          duration: bigint;
          startTime: bigint;
          insurer: `0x${string}`;
          triggerThreshold: bigint;
          status: number;
        };

        combined.push({
          policyId: policyIds[i],
          global: {
            id: globalResult.id,
            name: globalResult.name,
            verificationType: globalResult.verificationType,
            coverageAmount: globalResult.coverageAmount,
            premiumAmount: globalResult.premiumAmount,
            duration: globalResult.duration,
            startTime: globalResult.startTime,
            insurer: globalResult.insurer,
            triggerThreshold: globalResult.triggerThreshold,
            status: globalResult.status,
          },
          vault: {
            allocationWeight: vaultResult[0],
            premium: vaultResult[1],
            earnedPremium: vaultResult[2],
            coverage: vaultResult[3],
            duration: vaultResult[4],
            startTime: vaultResult[5],
            timeRemaining: vaultResult[6],
            claimed: vaultResult[7],
            expired: vaultResult[8],
          },
        });
      }
    }
  }

  return {
    policyIds,
    policies: combined,
    isLoading,
  };
}
