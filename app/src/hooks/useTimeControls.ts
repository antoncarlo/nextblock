'use client';

import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { POLICY_REGISTRY_ABI, MOCK_ORACLE_ABI, MOCK_USDC_ABI } from '@/config/contracts';
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

/**
 * Hook for setting BTC price in MockOracle.
 */
export function useSetBtcPrice() {
  const addresses = useAddresses();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const setBtcPrice = (price: bigint) => {
    writeContract({
      address: addresses.mockOracle,
      abi: MOCK_ORACLE_ABI,
      functionName: 'setBtcPrice',
      args: [price],
    });
  };

  return { setBtcPrice, isPending, isSuccess, error, txHash };
}

/**
 * Hook for setting flight status in MockOracle.
 */
export function useSetFlightStatus() {
  const addresses = useAddresses();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const setFlightStatus = (delayed: boolean) => {
    writeContract({
      address: addresses.mockOracle,
      abi: MOCK_ORACLE_ABI,
      functionName: 'setFlightStatus',
      args: [delayed],
    });
  };

  return { setFlightStatus, isPending, isSuccess, error, txHash };
}

/**
 * Hook for minting MockUSDC to an address (demo utility).
 */
export function useMintUSDC() {
  const addresses = useAddresses();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const mint = (to: `0x${string}`, amount: bigint) => {
    writeContract({
      address: addresses.mockUSDC,
      abi: MOCK_USDC_ABI,
      functionName: 'mint',
      args: [to, amount],
    });
  };

  return { mint, isPending, isSuccess, error, txHash };
}
