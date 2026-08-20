'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { VAULT_ALLOCATOR_ABI, INSURANCE_VAULT_ABI } from '@/config/contracts';
import { useAddresses } from '@/hooks/useAddresses';

/**
 * A concentration bucket sitting above its percentage threshold.
 *
 * The state exists because the threshold is a percentage of the vault's
 * investable base, and that base falls when LPs redeem. Exposure that was
 * inside the limit when it was written can be outside it afterwards without
 * anyone having allocated anything — a breach nobody caused.
 *
 * It is reported rather than acted on. Adding to a breaching bucket is already
 * refused on-chain, and unwinding is deliberately not forced: pulling capital
 * out of a live treaty removes the collateral behind cover that has already
 * been written, which trades a concentration problem for a solvency one.
 */
export type PassiveBreach = {
  portfolioId: bigint;
  /** Portfolio bucket is above its threshold. */
  portfolioBreached: boolean;
  /** Cedant bucket is above its threshold. */
  cedantBreached: boolean;
  /** How far over the portfolio bucket sits, in asset units. */
  portfolioExcess: bigint;
  /** How far over the cedant bucket sits, in asset units. */
  cedantExcess: bigint;
};

type Result = {
  breaches: PassiveBreach[];
  /** Every allocated portfolio, breaching or not. */
  checked: PassiveBreach[];
  isLoading: boolean;
  /** True when the read failed. Distinct from "no breaches found". */
  isUnavailable: boolean;
};

/**
 * Reads the passive-breach state of every portfolio a vault has allocated to.
 *
 * The distinction between `isUnavailable` and an empty `breaches` list is the
 * point of the shape: a failed read and a clean book look identical to a
 * component that only receives a list, and showing "no concentration issues"
 * because an RPC call failed is worse than showing nothing.
 */
export function usePassiveBreach(vaultAddress?: `0x${string}`): Result {
  const addresses = useAddresses();
  // `useAddresses` falls back to a zero-filled book on an unknown chain, so the
  // allocator can be present-but-zero rather than absent. Reading against the
  // zero address would fail on every call and look like a clean book.
  const raw = addresses?.vaultAllocator as `0x${string}` | undefined;
  const allocator = raw && raw !== '0x0000000000000000000000000000000000000000' ? raw : undefined;

  const { data: allocated, isLoading: loadingIds, isError: idsFailed } = useReadContract({
    address: vaultAddress,
    abi: INSURANCE_VAULT_ABI,
    functionName: 'getAllocatedPortfolios',
    query: { enabled: Boolean(vaultAddress) },
  });

  const portfolioIds = (allocated as bigint[] | undefined) ?? [];

  const { data: statuses, isLoading: loadingStatuses, isError: statusesFailed } = useReadContracts({
    contracts: portfolioIds.map((id) => ({
      address: allocator,
      abi: VAULT_ALLOCATOR_ABI,
      functionName: 'passiveBreachStatus' as const,
      args: [vaultAddress as `0x${string}`, id],
    })),
    query: { enabled: Boolean(allocator && vaultAddress && portfolioIds.length > 0) },
  });

  const checked: PassiveBreach[] = [];
  if (statuses) {
    statuses.forEach((entry, i) => {
      if (entry.status !== 'success') return;
      const [portfolioBreached, cedantBreached, portfolioExcess, cedantExcess] = entry.result as readonly [
        boolean,
        boolean,
        bigint,
        bigint,
      ];
      checked.push({
        portfolioId: portfolioIds[i],
        portfolioBreached,
        cedantBreached,
        portfolioExcess,
        cedantExcess,
      });
    });
  }

  return {
    breaches: checked.filter((b) => b.portfolioBreached || b.cedantBreached),
    checked,
    isLoading: loadingIds || loadingStatuses,
    isUnavailable: idsFailed || statusesFailed || !allocator,
  };
}
