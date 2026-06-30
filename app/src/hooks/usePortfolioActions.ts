'use client';

import { useCallback, useState } from 'react';
import { useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { PORTFOLIO_REGISTRY_ABI } from '@/config/contracts';
import { useAddresses } from './useAddresses';
import type { PortfolioSubmissionParams } from '@/lib/portfolio/form';

/** The institutional stack lives on Base Sepolia only. */
const REQUIRED_CHAIN_ID = 84532;
const WRONG_CHAIN_MESSAGE = 'Please switch to Base Sepolia (chain 84532) to continue.';

/**
 * PortfolioRegistry onboarding write actions, gated on-chain by the registry's
 * roles. Every helper guards the active chain before sending; the UI only
 * surfaces the calls the connected wallet's role can make. Scope is
 * onboarding/review/activation only — no allocation, premium or fee writes.
 */
export function usePortfolioActions(onDone?: () => void) {
  const { portfolioRegistry } = useAddresses();
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
      // Localized cast: a generic dispatcher over a single typed ABI, so
      // wagmi's per-function overloads cannot be inferred from the string.
      writeContract(
        {
          address: portfolioRegistry,
          abi: PORTFOLIO_REGISTRY_ABI,
          functionName,
          args,
        } as Parameters<typeof writeContract>[0],
        { onSuccess: () => onDone?.() },
      );
    },
    [chainId, portfolioRegistry, writeContract, onDone],
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
    submitPortfolio: (p: PortfolioSubmissionParams) => send('submitPortfolio', [p]),
    updateMetadata: (portfolioId: bigint, metadataURI: string, documentHash: `0x${string}`) =>
      send('updateMetadata', [portfolioId, metadataURI, documentHash]),

    // Underwriting Curator (the only review/approval authority)
    startReview: (portfolioId: bigint) => send('startReview', [portfolioId]),
    approvePortfolio: (portfolioId: bigint, expectedLossBps: number) =>
      send('approvePortfolio', [portfolioId, expectedLossBps]),
    rejectPortfolio: (portfolioId: bigint, reason: string) => send('rejectPortfolio', [portfolioId, reason]),
    activatePortfolio: (portfolioId: bigint) => send('activatePortfolio', [portfolioId]),
  };
}
