'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { useAddresses } from './useAddresses';
import { CLAIM_MANAGER_ABI, NEXTBLOCK_LENS_ABI, isDeployed } from '@/config/contracts';
import { LensDataStatus } from './useNextBlockLens';

/**
 * Claim lifecycle read model. Enumerates claims through the canonical
 * NextBlockLens.getClaimDashboard view (never reverts: missing modules and
 * unknown ids degrade to UNAVAILABLE / NONE, and the UI must mirror that).
 * Writes live in useClaimActions; this module is strictly read-only.
 *
 * Enum mirrors of contracts/src/ClaimManager.sol (keep in sync).
 */

export enum ClaimType {
  NON_PARAMETRIC = 0,
  PARAMETRIC = 1,
}

export enum ClaimStatus {
  SUBMITTED = 0,
  ASSESSED = 1,
  DISPUTED = 2,
  APPROVED = 3,
  PAID = 4,
  REJECTED = 5,
}

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  [ClaimStatus.SUBMITTED]: 'Submitted',
  [ClaimStatus.ASSESSED]: 'Assessed',
  [ClaimStatus.DISPUTED]: 'Disputed',
  [ClaimStatus.APPROVED]: 'Approved',
  [ClaimStatus.PAID]: 'Paid',
  [ClaimStatus.REJECTED]: 'Rejected',
};

export const CLAIM_STATUS_COLOR: Record<ClaimStatus, { bg: string; color: string }> = {
  [ClaimStatus.SUBMITTED]: { bg: '#EFF6FF', color: '#1D4ED8' },
  [ClaimStatus.ASSESSED]: { bg: '#F0F9FF', color: '#0E7490' },
  [ClaimStatus.DISPUTED]: { bg: '#FFF7ED', color: '#C2410C' },
  [ClaimStatus.APPROVED]: { bg: '#F0FDF4', color: '#166534' },
  [ClaimStatus.PAID]: { bg: '#ECFDF5', color: '#047857' },
  [ClaimStatus.REJECTED]: { bg: '#FEF2F2', color: '#B91C1C' },
};

/** Decoded claim plus the advisory assessment context from the lens view. */
export interface ClaimView {
  claimId: bigint;
  portfolioId: bigint;
  vault: `0x${string}`;
  claimant: `0x${string}`;
  requestedAmount: bigint;
  approvedAmount: bigint;
  claimType: ClaimType;
  status: ClaimStatus;
  evidenceHash: `0x${string}`;
  submittedAt: bigint;
  challengeDeadline: bigint;
  frozen: boolean;
  receiptId: bigint;
  disputeWindowElapsed: boolean;
  hasAssessment: boolean;
  anomalous: boolean;
  assessmentScoreBps: number;
  assessmentAnomalyBps: number;
}

const QUERY = { refetchInterval: 30_000 };

/** Total number of claims ever submitted (ClaimManager.getClaimCount). */
export function useClaimCount() {
  const { claimManager } = useAddresses();
  const deployed = isDeployed(claimManager);
  const read = useReadContract({
    address: claimManager,
    abi: CLAIM_MANAGER_ABI,
    functionName: 'getClaimCount',
    query: { ...QUERY, enabled: deployed },
  });
  return { deployed, ...read };
}

interface LensClaimDashboard {
  status: number;
  claim: {
    claimId: bigint;
    portfolioId: bigint;
    vault: `0x${string}`;
    claimant: `0x${string}`;
    requestedAmount: bigint;
    approvedAmount: bigint;
    claimType: number;
    status: number;
    evidenceHash: `0x${string}`;
    submittedAt: bigint;
    challengeDeadline: bigint;
    frozen: boolean;
    receiptId: bigint;
  };
  disputeWindowElapsed: boolean;
  hasAssessment: boolean;
  assessment: { scoreBps: number; anomalyScoreBps: number };
  anomalous: boolean;
}

/**
 * Batch-read every claim via the lens dashboard. Claim ids are 0..count-1
 * (ClaimManager assigns them with a monotonic counter). Returns decoded,
 * AVAILABLE claims newest-first; ids the lens reports as non-AVAILABLE are
 * skipped rather than shown as invented rows.
 */
export function useAllClaims() {
  const { nextBlockLens } = useAddresses();
  const lensDeployed = isDeployed(nextBlockLens);
  const { data: count } = useClaimCount();
  const n = count !== undefined ? Number(count as bigint) : 0;

  const contracts = Array.from({ length: n }, (_, i) => ({
    address: nextBlockLens,
    abi: NEXTBLOCK_LENS_ABI,
    functionName: 'getClaimDashboard' as const,
    args: [BigInt(i)] as const,
  }));

  const read = useReadContracts({
    contracts,
    query: { ...QUERY, enabled: lensDeployed && n > 0 },
  });

  const claims: ClaimView[] = (read.data ?? [])
    .filter(r => r.status === 'success' && r.result)
    .map(r => r.result as unknown as LensClaimDashboard)
    .filter(v => v.status === LensDataStatus.AVAILABLE)
    .map(v => ({
      claimId: v.claim.claimId,
      portfolioId: v.claim.portfolioId,
      vault: v.claim.vault,
      claimant: v.claim.claimant,
      requestedAmount: v.claim.requestedAmount,
      approvedAmount: v.claim.approvedAmount,
      claimType: v.claim.claimType as ClaimType,
      status: v.claim.status as ClaimStatus,
      evidenceHash: v.claim.evidenceHash,
      submittedAt: v.claim.submittedAt,
      challengeDeadline: v.claim.challengeDeadline,
      frozen: v.claim.frozen,
      receiptId: v.claim.receiptId,
      disputeWindowElapsed: v.disputeWindowElapsed,
      hasAssessment: v.hasAssessment,
      anomalous: v.anomalous,
      assessmentScoreBps: Number(v.assessment?.scoreBps ?? 0),
      assessmentAnomalyBps: Number(v.assessment?.anomalyScoreBps ?? 0),
    }))
    .sort((a, b) => Number(b.claimId - a.claimId));

  return {
    lensDeployed,
    claims,
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
