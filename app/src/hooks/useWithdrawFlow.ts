'use client';

import { useState, useCallback, useEffect } from 'react';
import { useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { INSURANCE_VAULT_ABI } from '@/config/contracts';

/** The institutional stack lives on Base Sepolia only. */
const REQUIRED_CHAIN_ID = 84532;
const WRONG_CHAIN_MESSAGE =
  'Please switch to Base Sepolia (chain 84532) to continue.';

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
  const chainId = useChainId();
  const isWrongChain = chainId !== REQUIRED_CHAIN_ID;
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
    // Guard before any wallet interaction: transactions signed on the wrong
    // network would target addresses that do not exist there.
    if (chainId !== REQUIRED_CHAIN_ID) {
      setState('ERROR');
      setError(WRONG_CHAIN_MESSAGE);
      return;
    }
    setError(null);
    setState('WITHDRAWING');

    writeContract({
      address: vaultAddress,
      abi: INSURANCE_VAULT_ABI,
      functionName: 'withdraw',
      args: [amount, receiver, owner],
    });
  }, [amount, chainId, vaultAddress, receiver, owner, writeContract]);

  const reset = useCallback(() => {
    setState('IDLE');
    setError(null);
  }, []);

  return {
    state,
    error,
    startWithdraw,
    reset,
    isWrongChain,
    isPending,
    txHash,
  };
}
