'use client';

import { useAccount, useReadContracts } from 'wagmi';
import { REDEMPTION_QUEUE_ABI } from '@/config/redemption';
import { INSURANCE_VAULT_ABI } from '@/config/contracts';

/** Most-recently-settled epoch the connected LP can claim (no indexer: current-state only). */
export interface ClaimableEpoch {
  epochId: bigint;
  settled: boolean;
  /** Pro-rata USDC the LP would receive (previewClaim). */
  assetsPaid: bigint;
  /** Unsettled nbRV returned to the LP (previewClaim). */
  sharesReturned: bigint;
  alreadyClaimed: boolean;
  hasRequest: boolean;
}

export interface RedemptionQueueData {
  /** True only when a queue address is configured and its reads resolved. */
  available: boolean;
  paused: boolean;
  vault?: `0x${string}`;
  epochDurationSec: number;
  currentEpochId: bigint;
  /** Unix seconds at which the current open epoch can be settled. */
  currentEpochMaturesAt: number;
  // --- connected-wallet position ---
  /** nbRV balance held by the LP. */
  userShares: bigint;
  /** Shares instantly redeemable on the vault now (within the free buffer). */
  instantRedeemable: bigint;
  /** Shares the LP has already escrowed into the current open epoch. */
  openEpochRequested: bigint;
  /** The most recent settled epoch the LP may claim, if any. */
  claimable: ClaimableEpoch | null;
  refetch: () => void;
}

type ReadResult = { status: 'success' | 'failure'; result?: unknown } | undefined;
const ZERO = '0x0000000000000000000000000000000000000000' as const;

function asBig(r: ReadResult): bigint {
  return r && r.status === 'success' && typeof r.result === 'bigint' ? r.result : 0n;
}
function asBool(r: ReadResult): boolean {
  return !!r && r.status === 'success' && r.result === true;
}
function asAddr(r: ReadResult): `0x${string}` | undefined {
  return r && r.status === 'success' && typeof r.result === 'string' ? (r.result as `0x${string}`) : undefined;
}
function asTuple(r: ReadResult): readonly unknown[] {
  if (r && r.status === 'success' && Array.isArray(r.result)) return r.result as readonly unknown[];
  return [];
}
function bigAt(t: readonly unknown[], i: number): bigint {
  return typeof t[i] === 'bigint' ? (t[i] as bigint) : 0n;
}

/**
 * Reads RedemptionQueue + bound-vault state for the LP exit panel. The bound
 * vault is resolved FROM the queue, then a second batched read fetches the LP's
 * nbRV balance, instant-redeemable amount (within buffer), the current-epoch
 * request and the most recent settled epoch's claim preview. Returns
 * `available: false` until a queue address is configured.
 */
export function useRedemptionQueue(queue?: `0x${string}`): RedemptionQueueData {
  const { address } = useAccount();
  const qAddr: `0x${string}` = queue ?? ZERO;
  const userAddr: `0x${string}` = address ?? ZERO;

  // Stage 1: queue scalars (incl. the bound vault and the current epoch id).
  const { data: q, refetch: refetchQ } = useReadContracts({
    contracts: [
      { address: qAddr, abi: REDEMPTION_QUEUE_ABI, functionName: 'vault' },
      { address: qAddr, abi: REDEMPTION_QUEUE_ABI, functionName: 'paused' },
      { address: qAddr, abi: REDEMPTION_QUEUE_ABI, functionName: 'epochDuration' },
      { address: qAddr, abi: REDEMPTION_QUEUE_ABI, functionName: 'currentEpochId' },
      { address: qAddr, abi: REDEMPTION_QUEUE_ABI, functionName: 'currentEpochMaturesAt' },
    ],
    query: { enabled: !!queue },
  });

  const qa = (q ?? []) as ReadResult[];
  const vaultAddr = asAddr(qa[0]);
  const currentEpochId = asBig(qa[3]);
  const prevEpochId = currentEpochId > 0n ? currentEpochId - 1n : 0n;
  const hasPrev = currentEpochId > 0n;

  // Stage 2: vault + per-epoch reads (enabled once the vault is resolved).
  const v: `0x${string}` = vaultAddr ?? ZERO;
  const { data: p, refetch: refetchP } = useReadContracts({
    contracts: [
      { address: v, abi: INSURANCE_VAULT_ABI, functionName: 'balanceOf', args: [userAddr] },
      { address: v, abi: INSURANCE_VAULT_ABI, functionName: 'maxRedeem', args: [userAddr] },
      { address: qAddr, abi: REDEMPTION_QUEUE_ABI, functionName: 'sharesRequested', args: [currentEpochId, userAddr] },
      { address: qAddr, abi: REDEMPTION_QUEUE_ABI, functionName: 'epochs', args: [prevEpochId] },
      { address: qAddr, abi: REDEMPTION_QUEUE_ABI, functionName: 'sharesRequested', args: [prevEpochId, userAddr] },
      { address: qAddr, abi: REDEMPTION_QUEUE_ABI, functionName: 'claimed', args: [prevEpochId, userAddr] },
      { address: qAddr, abi: REDEMPTION_QUEUE_ABI, functionName: 'previewClaim', args: [prevEpochId, userAddr] },
    ],
    query: { enabled: !!queue && !!vaultAddr && !!address },
  });

  const pa = (p ?? []) as ReadResult[];
  const prevEpochTuple = asTuple(pa[3]); // (totalReq, settledShares, settledAssets, settledAt, settled)
  const prevSettled = prevEpochTuple.length >= 5 && prevEpochTuple[4] === true;
  const prevPreview = asTuple(pa[6]); // (assetsPaid, sharesReturned)
  const prevRequested = asBig(pa[4]);

  const claimable: ClaimableEpoch | null =
    hasPrev && prevRequested > 0n
      ? {
          epochId: prevEpochId,
          settled: prevSettled,
          assetsPaid: bigAt(prevPreview, 0),
          sharesReturned: bigAt(prevPreview, 1),
          alreadyClaimed: asBool(pa[5]),
          hasRequest: true,
        }
      : null;

  return {
    available: !!queue && qa[0]?.status === 'success',
    paused: asBool(qa[1]),
    vault: vaultAddr,
    epochDurationSec: Number(asBig(qa[2])),
    currentEpochId,
    currentEpochMaturesAt: Number(asBig(qa[4])),
    userShares: asBig(pa[0]),
    instantRedeemable: asBig(pa[1]),
    openEpochRequested: asBig(pa[2]),
    claimable,
    refetch: () => {
      refetchQ();
      refetchP();
    },
  };
}
