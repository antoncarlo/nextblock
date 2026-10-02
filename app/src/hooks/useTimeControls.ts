'use client';

import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { POLICY_REGISTRY_ABI } from '@/config/contracts';
import { useAddresses } from './useAddresses';

/**
 * Hook for advancing time in the PolicyRegistry.
 */
export function useAdvanceTime() {
  const addresses = useAddresses();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const advanceTime = (seconds: bigint) => {
    writeContract({
      address: addresses.policyRegistry,
      abi: POLICY_REGISTRY_ABI,
      functionName: 'advanceTime',
      args: [seconds],
    });
  };

  return { advanceTime, isPending, isSuccess, error, txHash };
}
