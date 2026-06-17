'use client';

import { useReadContracts } from 'wagmi';
import { useAddresses } from './useAddresses';
import { useLensVaultDashboard, LensDataStatus } from './useNextBlockLens';
import { PREMIUM_DISTRIBUTOR_ABI, isDeployed } from '@/config/contracts';
import { deriveMoneyFlow, type MoneyFlowView, type MoneyFlowInput } from '@/lib/moneyflow';

export interface UseMoneyFlowResult {
  available: boolean;
  view?: MoneyFlowView;
  refetch: () => void;
}

/**
 * Reads the canonical Money Flow state for a vault from NextBlockLens
 * (`getVaultDashboard`) plus the distributor-wide protocol fee fields, and
 * derives the Figma Money Flow cards. `available` is false until the lens/vault
 * read resolves. No write path; presentation derivation only.
 */
export function useMoneyFlow(vault?: `0x${string}`): UseMoneyFlowResult {
  const { premiumDistributor } = useAddresses();
  const vd = useLensVaultDashboard(vault);
  const distDeployed = isDeployed(premiumDistributor);

  const fees = useReadContracts({
    contracts: [
      { address: premiumDistributor, abi: PREMIUM_DISTRIBUTOR_ABI, functionName: 'protocolFeeBps' },
      { address: premiumDistributor, abi: PREMIUM_DISTRIBUTOR_ABI, functionName: 'accruedProtocolFees' },
    ],
    query: { enabled: distDeployed },
  });

  const refetch = () => {
    vd.refetch?.();
    fees.refetch?.();
  };

  const d = vd.data;
  const available = !!d && Number(d.status) === LensDataStatus.AVAILABLE;
  if (!available || !d) {
    return { available: false, refetch };
  }

  const protocolFeeBps = (fees.data?.[0]?.result as bigint | undefined) ?? 0n;
  const accruedProtocolFees = (fees.data?.[1]?.result as bigint | undefined) ?? 0n;

  const input: MoneyFlowInput = {
    totalAssets: d.totalAssets,
    totalShares: d.totalShares,
    sharePrice: d.sharePrice,
    balance: d.balance,
    unearnedPremiums: d.unearnedPremiums,
    pendingClaims: d.pendingClaims,
    deployedCapital: d.deployedCapital,
    portfolioAllocated: d.portfolioAllocated,
    availableBuffer: d.availableBuffer,
    bufferRatioBps: d.bufferRatioBps,
    protocolFeeBps,
    accruedProtocolFees,
    accumulatedFees: d.accumulatedFees,
  };

  return { available: true, view: deriveMoneyFlow(input), refetch };
}
