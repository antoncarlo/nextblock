'use client';

import { useCallback, useEffect, useReducer } from 'react';
import { useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { INSURANCE_VAULT_ABI } from '@/config/contracts';

/** The institutional stack lives on Base Sepolia only. */
const REQUIRED_CHAIN_ID = 84532;
const WRONG_CHAIN_MESSAGE =
  'Please switch to Base Sepolia (chain 84532) to continue.';

/**
 * Withdraw flow state machine:
 * IDLE -> WITHDRAWING -> SUCCESS | ERROR
 *
 * Modelled with useReducer so the transaction-receipt effects dispatch actions
 * instead of calling a useState setter synchronously inside the effect (which
 * the React Compiler set-state-in-effect rule flags as a cascading render).
 * Behaviour and the public API are unchanged.
 */
export type WithdrawState = 'IDLE' | 'WITHDRAWING' | 'SUCCESS' | 'ERROR';

interface FlowState {
  status: WithdrawState;
  error: string | null;
}

type FlowAction =
  | { type: 'START' }
  | { type: 'WRONG_CHAIN' }
  | { type: 'CONFIRMED' }
  | { type: 'FAILED'; message: string }
  | { type: 'RESET' };

const INITIAL_FLOW: FlowState = { status: 'IDLE', error: null };

function withdrawReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'START':
      return { status: 'WITHDRAWING', error: null };
    case 'WRONG_CHAIN':
      return { status: 'ERROR', error: WRONG_CHAIN_MESSAGE };
    case 'CONFIRMED':
      return state.status === 'WITHDRAWING' ? { status: 'SUCCESS', error: null } : state;
    case 'FAILED':
      return state.status === 'WITHDRAWING' ? { status: 'ERROR', error: action.message } : state;
    case 'RESET':
      return INITIAL_FLOW;
    default:
      return state;
  }
}

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
  const [flow, dispatch] = useReducer(withdrawReducer, INITIAL_FLOW);

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
    if (txConfirmed && flow.status === 'WITHDRAWING') {
      dispatch({ type: 'CONFIRMED' });
      onSuccess?.();
    }
  }, [txConfirmed, flow.status, onSuccess]);

  useEffect(() => {
    if (writeError && flow.status === 'WITHDRAWING') {
      dispatch({ type: 'FAILED', message: writeError.message.split('\n')[0] });
    }
  }, [writeError, flow.status]);

  const startWithdraw = useCallback(() => {
    if (amount <= 0n) return;
    // Guard before any wallet interaction: transactions signed on the wrong
    // network would target addresses that do not exist there.
    if (chainId !== REQUIRED_CHAIN_ID) {
      dispatch({ type: 'WRONG_CHAIN' });
      return;
    }
    dispatch({ type: 'START' });

    writeContract({
      address: vaultAddress,
      abi: INSURANCE_VAULT_ABI,
      functionName: 'withdraw',
      args: [amount, receiver, owner],
    });
  }, [amount, chainId, vaultAddress, receiver, owner, writeContract]);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return {
    state: flow.status,
    error: flow.error,
    startWithdraw,
    reset,
    isWrongChain,
    isPending,
    txHash,
  };
}
