'use client';

import { useReadContract } from 'wagmi';
import { useAddresses } from './useAddresses';
import { NEXTBLOCK_LENS_ABI, isDeployed } from '@/config/contracts';

/**
 * NextBlockLens — canonical READ-ONLY source for the institutional dashboards
 * (Phase 10 on-chain read model, Phase 12 frontend wiring).
 *
 * The lens NEVER reverts on its aggregate views: missing modules degrade to
 * DataStatus.UNAVAILABLE and unknown keys to NONE. The UI must mirror that
 * contract: render "Unavailable" — never invented data.
 *
 * Enum mirrors of contracts/src/NextBlockLens.sol (keep in sync).
 */
export enum LensDataStatus {
  UNAVAILABLE = 0,
  NONE = 1,
  AVAILABLE = 2,
  STALE = 3,
  PAUSED = 4,
}

export enum LensDataSource {
  ONCHAIN = 0,
  MOCK_ORACLE = 1,
  LEGACY_RETIRED = 2,
  NOT_AVAILABLE = 3,
}

/** Map an on-chain LensDataSource to the UI DataSourceBadge source key. */
export function lensSourceToBadge(
  source: LensDataSource,
): 'onchain' | 'mock-oracle' | 'demo-legacy' | 'unavailable' {
  switch (source) {
    case LensDataSource.ONCHAIN:
      return 'onchain';
    case LensDataSource.MOCK_ORACLE:
      return 'mock-oracle';
    case LensDataSource.LEGACY_RETIRED:
      return 'demo-legacy';
    default:
      return 'unavailable';
  }
}

const QUERY = { refetchInterval: 30_000 };

/** Protocol-wide status: module address book + entity counters. */
export function useLensProtocolStatus() {
  const { nextBlockLens } = useAddresses();
  const lensDeployed = isDeployed(nextBlockLens);
  const read = useReadContract({
    address: nextBlockLens,
    abi: NEXTBLOCK_LENS_ABI,
    functionName: 'getProtocolStatus',
    query: { ...QUERY, enabled: lensDeployed },
  });
  return { lensDeployed, lensAddress: nextBlockLens, ...read };
}

/** Aggregated vault accounting (TVL, UPR, reserves, buffer, bound modules). */
export function useLensVaultDashboard(vault?: `0x${string}`) {
  const { nextBlockLens } = useAddresses();
  const lensDeployed = isDeployed(nextBlockLens);
  const read = useReadContract({
    address: nextBlockLens,
    abi: NEXTBLOCK_LENS_ABI,
    functionName: 'getVaultDashboard',
    args: vault ? [vault] : undefined,
    query: { ...QUERY, enabled: lensDeployed && !!vault },
  });
  return { lensDeployed, lensAddress: nextBlockLens, ...read };
}

/** Compliance + position view for the connected LP. */
export function useLensLPStatus(vault?: `0x${string}`, lp?: `0x${string}`) {
  const { nextBlockLens } = useAddresses();
  const lensDeployed = isDeployed(nextBlockLens);
  const read = useReadContract({
    address: nextBlockLens,
    abi: NEXTBLOCK_LENS_ABI,
    functionName: 'getLPStatus',
    args: vault && lp ? [vault, lp] : undefined,
    query: { ...QUERY, enabled: lensDeployed && !!vault && !!lp },
  });
  return { lensDeployed, lensAddress: nextBlockLens, ...read };
}

/** Canonical NAV oracle view for a vault (status, source, staleness guards). */
export function useLensOracleDashboard(vault?: `0x${string}`) {
  const { nextBlockLens } = useAddresses();
  const lensDeployed = isDeployed(nextBlockLens);
  const read = useReadContract({
    address: nextBlockLens,
    abi: NEXTBLOCK_LENS_ABI,
    functionName: 'getOracleDashboard',
    args: vault ? [vault] : undefined,
    query: { ...QUERY, enabled: lensDeployed && !!vault },
  });
  return { lensDeployed, lensAddress: nextBlockLens, ...read };
}
