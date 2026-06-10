'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { POLICY_REGISTRY_ABI } from '@/config/contracts';
import { POLL_INTERVAL } from '@/config/constants';
import { useAddresses } from './useAddresses';

/**
 * Fetch the current virtual time from PolicyRegistry.
 */
export function useCurrentTime() {
  const addresses = useAddresses();
  return useReadContract({
    address: addresses.policyRegistry,
    abi: POLICY_REGISTRY_ABI,
    functionName: 'currentTime',
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: addresses.policyRegistry !== '0x0000000000000000000000000000000000000000',
    },
  });
}

/**
 * Fetch the time offset from PolicyRegistry.
 */
export function useTimeOffset() {
  const addresses = useAddresses();
  return useReadContract({
    address: addresses.policyRegistry,
    abi: POLICY_REGISTRY_ABI,
    functionName: 'timeOffset',
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: addresses.policyRegistry !== '0x0000000000000000000000000000000000000000',
    },
  });
}

/**
 * Fetch total number of registered policies.
 */
export function usePolicyCount() {
  const addresses = useAddresses();
  return useReadContract({
    address: addresses.policyRegistry,
    abi: POLICY_REGISTRY_ABI,
    functionName: 'getPolicyCount',
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: addresses.policyRegistry !== '0x0000000000000000000000000000000000000000',
    },
  });
}

/**
 * Fetch all policies from the registry.
 */
export function useAllPolicies(count: bigint | undefined) {
  const addresses = useAddresses();
  const policyCount = Number(count ?? 0n);
  const contracts = Array.from({ length: policyCount }, (_, i) => ({
    address: addresses.policyRegistry,
    abi: POLICY_REGISTRY_ABI,
    functionName: 'getPolicy' as const,
    args: [BigInt(i)] as const,
  }));

  return useReadContracts({
    contracts,
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled:
        policyCount > 0 &&
        addresses.policyRegistry !== '0x0000000000000000000000000000000000000000',
    },
  });
}
