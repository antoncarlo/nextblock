'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { useAddresses } from './useAddresses';
import { PORTFOLIO_REGISTRY_ABI, isDeployed } from '@/config/contracts';
import { StructureType, STRUCTURE_LABEL } from '@/lib/portfolio/form';

/**
 * PortfolioRegistry read model for the institutional onboarding lifecycle
 * (submit -> review -> approve -> activate). Reads the canonical on-chain
 * registry directly; the panel filters by cedant for the cedant view and shows
 * the full set for the curator review queue. Writes live in usePortfolioActions.
 *
 * Enum mirrors of contracts/src/PortfolioRegistry.sol (keep in sync).
 * StructureType / STRUCTURE_LABEL live in the pure form lib (shared with the
 * smoke script) and are re-exported here for UI convenience.
 */

export { StructureType, STRUCTURE_LABEL };

export enum PortfolioStatus {
  SUBMITTED = 0,
  UNDER_REVIEW = 1,
  APPROVED = 2,
  ACTIVE = 3,
  PAUSED = 4,
  EXPIRED = 5,
  REJECTED = 6,
}

export const PORTFOLIO_STATUS_LABEL: Record<PortfolioStatus, string> = {
  [PortfolioStatus.SUBMITTED]: 'Submitted',
  [PortfolioStatus.UNDER_REVIEW]: 'Under review',
  [PortfolioStatus.APPROVED]: 'Approved',
  [PortfolioStatus.ACTIVE]: 'Active',
  [PortfolioStatus.PAUSED]: 'Paused',
  [PortfolioStatus.EXPIRED]: 'Expired',
  [PortfolioStatus.REJECTED]: 'Rejected',
};

export const PORTFOLIO_STATUS_COLOR: Record<PortfolioStatus, { bg: string; color: string }> = {
  [PortfolioStatus.SUBMITTED]: { bg: '#EFF6FF', color: '#1D4ED8' },
  [PortfolioStatus.UNDER_REVIEW]: { bg: '#FFF7ED', color: '#C2410C' },
  [PortfolioStatus.APPROVED]: { bg: '#F0F9FF', color: '#0E7490' },
  [PortfolioStatus.ACTIVE]: { bg: '#F0FDF4', color: '#166534' },
  [PortfolioStatus.PAUSED]: { bg: '#FEFCE8', color: '#A16207' },
  [PortfolioStatus.EXPIRED]: { bg: '#F3F4F6', color: '#4B5563' },
  [PortfolioStatus.REJECTED]: { bg: '#FEF2F2', color: '#B91C1C' },
};

export interface PortfolioView {
  portfolioId: bigint;
  cedant: `0x${string}`;
  name: string;
  metadataURI: string;
  documentHash: `0x${string}`;
  lineOfBusiness: string;
  jurisdiction: string;
  structureType: StructureType;
  coverageLimit: bigint;
  cededPremium: bigint;
  expectedLossBps: number;
  inceptionTime: bigint;
  expiryTime: bigint;
  status: PortfolioStatus;
  submittedAt: bigint;
  updatedAt: bigint;
}

const QUERY = { refetchInterval: 30_000 };

/** Total number of portfolios ever submitted (PortfolioRegistry.getPortfolioCount). */
export function usePortfolioCount() {
  const { portfolioRegistry } = useAddresses();
  const deployed = isDeployed(portfolioRegistry);
  const read = useReadContract({
    address: portfolioRegistry,
    abi: PORTFOLIO_REGISTRY_ABI,
    functionName: 'getPortfolioCount',
    query: { ...QUERY, enabled: deployed },
  });
  return { deployed, ...read };
}

interface RawPortfolio {
  portfolioId: bigint;
  cedant: `0x${string}`;
  name: string;
  metadataURI: string;
  documentHash: `0x${string}`;
  lineOfBusiness: string;
  jurisdiction: string;
  structureType: number;
  coverageLimit: bigint;
  cededPremium: bigint;
  expectedLossBps: number;
  inceptionTime: bigint;
  expiryTime: bigint;
  status: number;
  submittedAt: bigint;
  updatedAt: bigint;
}

/**
 * Batch-read every portfolio (ids 0..count-1) directly from the registry,
 * decoded and newest-first. Ids are assigned by a monotonic counter; reads
 * that fail are skipped rather than shown as invented rows.
 */
export function useAllPortfolios() {
  const { portfolioRegistry } = useAddresses();
  const deployed = isDeployed(portfolioRegistry);
  const { data: count } = usePortfolioCount();
  const n = count !== undefined ? Number(count as bigint) : 0;

  const contracts = Array.from({ length: n }, (_, i) => ({
    address: portfolioRegistry,
    abi: PORTFOLIO_REGISTRY_ABI,
    functionName: 'getPortfolio' as const,
    args: [BigInt(i)] as const,
  }));

  const read = useReadContracts({
    contracts,
    query: { ...QUERY, enabled: deployed && n > 0 },
  });

  const portfolios: PortfolioView[] = (read.data ?? [])
    .filter(r => r.status === 'success' && r.result)
    .map(r => r.result as unknown as RawPortfolio)
    .map(p => ({
      portfolioId: p.portfolioId,
      cedant: p.cedant,
      name: p.name,
      metadataURI: p.metadataURI,
      documentHash: p.documentHash,
      lineOfBusiness: p.lineOfBusiness,
      jurisdiction: p.jurisdiction,
      structureType: p.structureType as StructureType,
      coverageLimit: p.coverageLimit,
      cededPremium: p.cededPremium,
      expectedLossBps: Number(p.expectedLossBps),
      inceptionTime: p.inceptionTime,
      expiryTime: p.expiryTime,
      status: p.status as PortfolioStatus,
      submittedAt: p.submittedAt,
      updatedAt: p.updatedAt,
    }))
    .sort((a, b) => Number(b.portfolioId - a.portfolioId));

  return {
    deployed,
    portfolios,
    isLoading: read.isLoading,
    isError: read.isError,
    refetch: read.refetch,
    count: n,
  };
}

/** USDC (6 decimals) formatted for display. */
export function formatUsdc(amount: bigint): string {
  return (Number(amount) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Unix seconds (bigint) to a short date string. */
export function formatDate(unixSeconds: bigint): string {
  if (unixSeconds === 0n) return 'n/a';
  return new Date(Number(unixSeconds) * 1000).toISOString().slice(0, 10);
}
