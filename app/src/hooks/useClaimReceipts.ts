'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { CLAIM_RECEIPT_ABI } from '@/config/contracts';
import { POLL_INTERVAL } from '@/config/constants';
import { useAddresses } from './useAddresses';

/**
 * Claim receipt data.
 */
export interface ClaimReceiptData {
  receiptId: bigint;
  policyId: bigint;
  claimAmount: bigint;
  vault: `0x${string}`;
  insurer: `0x${string}`;
  timestamp: bigint;
  exercised: boolean;
}

/**
 * Fetch the next receipt ID (total count).
 */
export function useReceiptCount() {
  const addresses = useAddresses();
  return useReadContract({
    address: addresses.claimReceipt,
    abi: CLAIM_RECEIPT_ABI,
    functionName: 'nextReceiptId',
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: addresses.claimReceipt !== '0x0000000000000000000000000000000000000000',
    },
  });
}

/**
 * Fetch all claim receipts.
 * Iterates from 0 to nextReceiptId and fetches each receipt.
 */
export function useAllReceipts(nextReceiptId: bigint | undefined) {
  const addresses = useAddresses();
  const count = Number(nextReceiptId ?? 0n);
  const contracts = Array.from({ length: count }, (_, i) => ({
    address: addresses.claimReceipt,
    abi: CLAIM_RECEIPT_ABI,
    functionName: 'getReceipt' as const,
    args: [BigInt(i)] as const,
  }));

  const result = useReadContracts({
    contracts,
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled:
        count > 0 &&
        addresses.claimReceipt !== '0x0000000000000000000000000000000000000000',
    },
  });

  const receipts: ClaimReceiptData[] = [];
  if (result.data) {
    for (let i = 0; i < result.data.length; i++) {
      const r = result.data[i];
      if (r.status === 'success' && r.result) {
        const receipt = r.result as unknown as {
          policyId: bigint;
          claimAmount: bigint;
          vault: `0x${string}`;
          insurer: `0x${string}`;
          timestamp: bigint;
          exercised: boolean;
        };
        receipts.push({
          receiptId: BigInt(i),
          policyId: receipt.policyId,
          claimAmount: receipt.claimAmount,
          vault: receipt.vault,
          insurer: receipt.insurer,
          timestamp: receipt.timestamp,
          exercised: receipt.exercised,
        });
      }
    }
  }

  return {
    receipts,
    isLoading: result.isLoading,
    refetch: result.refetch,
  };
}
