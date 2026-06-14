'use client';

import { useCallback, useEffect, useReducer } from 'react';
import { useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { MOCK_USDC_ABI, INSURANCE_VAULT_ABI } from '@/config/contracts';
import { useAddresses } from './useAddresses';

/** The institutional stack lives on Base Sepolia only. */
const REQUIRED_CHAIN_ID = 84532;
const WRONG_CHAIN_MESSAGE =
  'Please switch to Base Sepolia (chain 84532) to continue.';

/**
 * Deposit flow state machine:
 * IDLE -> APPROVING -> DEPOSITING -> SUCCESS | ERROR
 *
 * Modelled with useReducer so the transaction-receipt effects dispatch actions
 * instead of calling a useState setter synchronously inside the effect (which
 * the React Compiler set-state-in-effect rule flags as a cascading render).
 * The chained deposit write stays in the approve-confirmation effect; behaviour
 * and the public API are unchanged. ('APPROVED' is kept in the type for
 * compatibility; the approve->deposit transition was never observable in a
 * render because both updates were batched.)
 */
export type DepositState =
  | 'IDLE'
  | 'APPROVING'
  | 'APPROVED'
  | 'DEPOSITING'
  | 'SUCCESS'
  | 'ERROR';

interface FlowState {
  status: DepositState;
  error: string | null;
}

type FlowAction =
  | { type: 'START' }
  | { type: 'WRONG_CHAIN' }
  | { type: 'APPROVE_CONFIRMED' }
  | { type: 'DEPOSIT_CONFIRMED' }
  | { type: 'FAILED'; message: string }
  | { type: 'RESET' };

const INITIAL_FLOW: FlowState = { status: 'IDLE', error: null };

function depositReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'START':
      return { status: 'APPROVING', error: null };
    case 'WRONG_CHAIN':
      return { status: 'ERROR', error: WRONG_CHAIN_MESSAGE };
    case 'APPROVE_CONFIRMED':
      return state.status === 'APPROVING' ? { status: 'DEPOSITING', error: null } : state;
    case 'DEPOSIT_CONFIRMED':
      return state.status === 'DEPOSITING' ? { status: 'SUCCESS', error: null } : state;
    case 'FAILED':
      return state.status === 'APPROVING' || state.status === 'DEPOSITING'
        ? { status: 'ERROR', error: action.message }
        : state;
    case 'RESET':
      return INITIAL_FLOW;
    default:
      return state;
  }
}

interface UseDepositFlowOptions {
  vaultAddress: `0x${string}`;
  amount: bigint;
  receiver: `0x${string}`;
  onSuccess?: () => void;
}

export function useDepositFlow({
  vaultAddress,
  amount,
  receiver,
  onSuccess,
}: UseDepositFlowOptions) {
  const addresses = useAddresses();
  const chainId = useChainId();
  const isWrongChain = chainId !== REQUIRED_CHAIN_ID;
  const [flow, dispatch] = useReducer(depositReducer, INITIAL_FLOW);

  // Approve step
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApprovePending,
    error: approveError,
  } = useWriteContract();

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  // Deposit step
  const {
    writeContract: writeDeposit,
    data: depositHash,
    isPending: isDepositPending,
    error: depositError,
  } = useWriteContract();

  const { isSuccess: depositConfirmed } = useWaitForTransactionReceipt({
    hash: depositHash,
  });

  // Handle approve confirmation -> auto-proceed to deposit
  useEffect(() => {
    if (approveConfirmed && flow.status === 'APPROVING') {
      // Auto-proceed to deposit
      writeDeposit({
        address: vaultAddress,
        abi: INSURANCE_VAULT_ABI,
        functionName: 'deposit',
        args: [amount, receiver],
      });
      dispatch({ type: 'APPROVE_CONFIRMED' });
    }
  }, [approveConfirmed, flow.status, writeDeposit, vaultAddress, amount, receiver]);

  // Handle deposit confirmation
  useEffect(() => {
    if (depositConfirmed && flow.status === 'DEPOSITING') {
      dispatch({ type: 'DEPOSIT_CONFIRMED' });
      onSuccess?.();
    }
  }, [depositConfirmed, flow.status, onSuccess]);

  // Handle errors
  useEffect(() => {
    if (approveError && flow.status === 'APPROVING') {
      dispatch({ type: 'FAILED', message: approveError.message.split('\n')[0] });
    }
  }, [approveError, flow.status]);

  useEffect(() => {
    if (depositError && flow.status === 'DEPOSITING') {
      dispatch({ type: 'FAILED', message: depositError.message.split('\n')[0] });
    }
  }, [depositError, flow.status]);

  const startDeposit = useCallback(() => {
    if (amount <= 0n) return;
    // Guard before any wallet interaction: transactions signed on the wrong
    // network would target addresses that do not exist there.
    if (chainId !== REQUIRED_CHAIN_ID) {
      dispatch({ type: 'WRONG_CHAIN' });
      return;
    }
    dispatch({ type: 'START' });

    writeApprove({
      address: addresses.mockUSDC,
      abi: MOCK_USDC_ABI,
      functionName: 'approve',
      args: [vaultAddress, amount],
    });
  }, [amount, chainId, vaultAddress, writeApprove, addresses.mockUSDC]);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return {
    state: flow.status,
    error: flow.error,
    startDeposit,
    reset,
    isWrongChain,
    isApprovePending,
    isDepositPending,
    approveHash,
    depositHash,
  };
}
