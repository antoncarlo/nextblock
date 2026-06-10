'use client';

import { useState, useCallback, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { INSURANCE_VAULT_ABI } from '@/config/contracts';

/**
 * Withdraw flow state machine:
 * IDLE -> WITHDRAWING -> SUCCESS | ERROR
 */
export type WithdrawState = 'IDLE' | 'WITHDRAWING' | 'SUCCESS' | 'ERROR';

interface UseWithdrawFlowOptions {
  vaultAddress: `0x${string}`;
  amount: bigint;
  receiver: `0x${string}`;
  owner: `0x${string}`;
  onSuccess?: () => void;
}

export function useWithdrawFlow({
  vaultAddress,
  amount,
  receiver,
  owner,
  onSuccess,
}: UseWithdrawFlowOptions) {
  const [state, setState] = useState<WithdrawState>('IDLE');
  const [error, setError] = useState<string | null>(null);

  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
  } = useWriteContract();

  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (txConfirmed && state === 'WITHDRAWING') {
      setState('SUCCESS');
      onSuccess?.();
    }
  }, [txConfirmed, state, onSuccess]);

  useEffect(() => {
    if (writeError && state === 'WITHDRAWING') {
      setState('ERROR');
      setError(writeError.message.split('\n')[0]);
    }
  }, [writeError, state]);

  const startWithdraw = useCallback(() => {
    if (amount <= 0n) return;
    setError(null);
    setState('WITHDRAWING');

    writeContract({
      address: vaultAddress,
      abi: INSURANCE_VAULT_ABI,
      functionName: 'withdraw',
      args: [amount, receiver, owner],
    });
  }, [amount, vaultAddress, receiver, owner, writeContract]);

  const reset = useCallback(() => {
    setState('IDLE');
    setError(null);
  }, []);

  return {
    state,
    error,
    startWithdraw,
    reset,
    isPending,
    txHash,
  };
}
