'use client';

import { useCallback, useState } from 'react';
import { useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CLAIM_MANAGER_ABI } from '@/config/contracts';
import { useAddresses } from './useAddresses';
import { ClaimType } from './useClaimLifecycle';

/** The institutional stack lives on Base Sepolia only. */
const REQUIRED_CHAIN_ID = 84532;
const WRONG_CHAIN_MESSAGE = 'Please switch to Base Sepolia (chain 84532) to continue.';

/**
 * Claim lifecycle write actions, gated on-chain by ClaimManager's roles.
 * Every helper guards the active chain before sending; nothing here can
 * approve or pay outside the contract's separation of powers (the UI only
 * surfaces the calls the connected wallet's role is allowed to make).
 */
export function useClaimActions(onDone?: () => void) {
  const { claimManager } = useAddresses();
  const chainId = useChainId();
  const isWrongChain = chainId !== REQUIRED_CHAIN_ID;

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isSuccess, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const [guardError, setGuardError] = useState<string | null>(null);

  const send = useCallback(
    (functionName: string, args: readonly unknown[]) => {
      setGuardError(null);
      if (chainId !== REQUIRED_CHAIN_ID) {
        setGuardError(WRONG_CHAIN_MESSAGE);
        return;
      }
      // Localized cast: this is a generic dispatcher over a single typed ABI,
      // so wagmi's per-function overloads cannot be inferred from the string.
      writeContract(
        {
          address: claimManager,
          abi: CLAIM_MANAGER_ABI,
          functionName,
          args,
        } as Parameters<typeof writeContract>[0],
        { onSuccess: () => onDone?.() },
      );
    },
    [chainId, claimManager, writeContract, onDone],
  );

  return {
    isWrongChain,
    isPending,
    isConfirming,
    isSuccess,
    txHash,
    error: guardError ?? (error ? error.message.split('\n')[0] : null),
    reset: () => {
      setGuardError(null);
      reset();
    },

    // Cedant
    submitClaim: (
      vault: `0x${string}`,
      portfolioId: bigint,
      amount: bigint,
      claimType: ClaimType,
      evidenceHash: `0x${string}`,
    ) => send('submitClaim', [vault, portfolioId, amount, claimType, evidenceHash]),

    // Permissionless: mirror the AI advisory store into the lifecycle
    attachAssessment: (claimId: bigint) => send('attachAssessment', [claimId]),

    // Sentinel (risk powers only; cannot approve or move funds)
    disputeClaim: (claimId: bigint, reason: string) => send('disputeClaim', [claimId, reason]),
    freezeClaim: (claimId: bigint) => send('freezeClaim', [claimId]),
    unfreezeClaim: (claimId: bigint) => send('unfreezeClaim', [claimId]),

    // Claims Committee (the only approval authority)
    resolveDispute: (claimId: bigint, uphold: boolean) => send('resolveDispute', [claimId, uphold]),
    approveClaim: (claimId: bigint, approvedAmount: bigint) => send('approveClaim', [claimId, approvedAmount]),
    rejectClaim: (claimId: bigint, reason: string) => send('rejectClaim', [claimId, reason]),

    // Permissionless: trigger the vault payout of an approved claim
    executeClaim: (claimId: bigint) => send('executeClaim', [claimId]),
  };
}
