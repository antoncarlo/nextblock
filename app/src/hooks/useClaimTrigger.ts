'use client';

import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { INSURANCE_VAULT_ABI } from '@/config/contracts';

/**
 * Hook for triggering P1 (on-chain, permissionless) claims.
 */
export function useCheckClaim() {
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const trigger = (vaultAddress: `0x${string}`, policyId: bigint) => {
    writeContract({
      address: vaultAddress,
      abi: INSURANCE_VAULT_ABI,
      functionName: 'checkClaim',
      args: [policyId],
    });
  };

  return { trigger, isPending, isSuccess, error, txHash };
}

/**
 * Hook for triggering P2 (oracle-dependent) claims.
 */
export function useReportEvent() {
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const trigger = (vaultAddress: `0x${string}`, policyId: bigint) => {
    writeContract({
      address: vaultAddress,
      abi: INSURANCE_VAULT_ABI,
      functionName: 'reportEvent',
      args: [policyId],
    });
  };

  return { trigger, isPending, isSuccess, error, txHash };
}

/**
 * Hook for triggering P3 (off-chain, insurer admin) claims.
 */
export function useSubmitClaim() {
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const trigger = (vaultAddress: `0x${string}`, policyId: bigint, amount: bigint) => {
    writeContract({
      address: vaultAddress,
      abi: INSURANCE_VAULT_ABI,
      functionName: 'submitClaim',
      args: [policyId, amount],
    });
  };

  return { trigger, isPending, isSuccess, error, txHash };
}

/**
 * Hook for exercising a claim receipt.
 */
export function useExerciseClaim() {
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const exercise = (vaultAddress: `0x${string}`, receiptId: bigint) => {
    writeContract({
      address: vaultAddress,
      abi: INSURANCE_VAULT_ABI,
      functionName: 'exerciseClaim',
      args: [receiptId],
    });
  };

  return { exercise, isPending, isSuccess, error, txHash };
}
