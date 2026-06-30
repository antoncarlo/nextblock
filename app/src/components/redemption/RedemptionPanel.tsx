'use client';

import { useState } from 'react';
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { useRedemptionQueue } from '@/hooks/useRedemptionQueue';
import { REDEMPTION_QUEUE_ABI, REDEMPTION_CHAIN_ID } from '@/config/redemption';
import { INSURANCE_VAULT_ABI } from '@/config/contracts';
import { formatUSDC } from '@/lib/formatting';
import { SHARE_SYMBOL, SHARE_DISCLAIMER } from '@/lib/disclosure';

interface RedemptionPanelProps {
  /** Deployed RedemptionQueue address, or undefined when not yet deployed. */
  queueAddress?: `0x${string}`;
}

/** nbRV shares are 18-decimals (vault `_decimalsOffset() = 12` over 6-dec USDC). */
const SHARE_DECIMALS = 18;
const fmtShares = (v: bigint) => Number(formatUnits(v, SHARE_DECIMALS)).toFixed(4);

/**
 * Institutional LP exit panel. Two paths, matching the on-chain liquidity model:
 *
 *  - Instant exit (within the vault's free buffer) → `vault.redeem`, settles now.
 *  - Queued exit (above buffer) → `RedemptionQueue.requestRedemption`, settled
 *    pro-rata at epoch close by a keeper, then `claim`ed (USDC + any unsettled
 *    nbRV returned).
 *
 * Surfaces the async lifecycle (Open → Queued → Settled/PartiallySettled →
 * Claimable → Claimed) rather than implying atomic finality.
 */
export function RedemptionPanel({ queueAddress }: RedemptionPanelProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const q = useRedemptionQueue(queueAddress);

  const [amount, setAmount] = useState('');
  const wrongChain = chainId !== REDEMPTION_CHAIN_ID;

  let parsedShares = 0n;
  try {
    parsedShares = amount ? parseUnits(amount, SHARE_DECIMALS) : 0n;
  } catch {
    parsedShares = 0n;
  }

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const busy = isPending || confirming;
  const withinBuffer = parsedShares > 0n && parsedShares <= q.instantRedeemable;

  function approveQueue() {
    if (!queueAddress || !q.vault) return;
    writeContract({ address: q.vault, abi: INSURANCE_VAULT_ABI, functionName: 'approve', args: [queueAddress, parsedShares] });
  }
  function instantRedeem() {
    if (!q.vault || !address) return;
    writeContract({ address: q.vault, abi: INSURANCE_VAULT_ABI, functionName: 'redeem', args: [parsedShares, address, address] });
  }
  function requestRedemption() {
    if (!queueAddress) return;
    writeContract({ address: queueAddress, abi: REDEMPTION_QUEUE_ABI, functionName: 'requestRedemption', args: [parsedShares] });
  }
  function claim() {
    if (!queueAddress || !q.claimable) return;
    writeContract({ address: queueAddress, abi: REDEMPTION_QUEUE_ABI, functionName: 'claim', args: [q.claimable.epochId] });
  }

  // --- Not deployed yet ---
  if (!queueAddress || !q.available) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Redeem {SHARE_SYMBOL}</h3>
        </div>
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-gray-500">The redemption queue is not yet deployed on this network.</p>
          <p className="mt-1 text-xs text-gray-400">
            Once live, you will be able to exit instantly within the buffer, or queue an above-buffer
            exit for pro-rata settlement at epoch close.
          </p>
        </div>
        <Disclaimer />
      </div>
    );
  }

  const matureDelta = q.currentEpochMaturesAt * 1000 - Date.now();
  const matureLabel =
    matureDelta <= 0
      ? 'mature (settle pending)'
      : `~${Math.floor(matureDelta / 86_400_000)}d ${Math.floor((matureDelta % 86_400_000) / 3_600_000)}h`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Redeem {SHARE_SYMBOL}</h3>
        {q.paused && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">paused</span>
        )}
      </div>

      <div className="space-y-4 p-4">
        {/* Queue + position metrics */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Metric label="Current epoch" value={`#${q.currentEpochId.toString()}`} />
          <Metric label="Settles in" value={matureLabel} />
          <Metric label={`Your ${SHARE_SYMBOL}`} value={fmtShares(q.userShares)} />
          <Metric label="Instant (in buffer)" value={fmtShares(q.instantRedeemable)} />
          <Metric label="Queued this epoch" value={fmtShares(q.openEpochRequested)} />
          <Metric label="Notice period" value={`${Math.round(q.epochDurationSec / 86_400)}d`} />
        </div>

        {/* Claim of a prior settled epoch */}
        {q.claimable && (
          <div className="rounded-lg border border-gray-100 px-3 py-2">
            <p className="mb-1 text-xs text-gray-500">
              Epoch #{q.claimable.epochId.toString()} —{' '}
              {q.claimable.alreadyClaimed
                ? 'Claimed'
                : q.claimable.settled
                  ? q.claimable.sharesReturned > 0n
                    ? 'Partially Settled · Claimable'
                    : 'Settled · Claimable'
                  : 'Queued (awaiting settle)'}
            </p>
            {q.claimable.settled && !q.claimable.alreadyClaimed && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-700">
                  {formatUSDC(q.claimable.assetsPaid)} USDC
                  {q.claimable.sharesReturned > 0n && ` + ${fmtShares(q.claimable.sharesReturned)} ${SHARE_SYMBOL} back`}
                </span>
                <ActionButton label="Claim" onClick={claim} disabled={wrongChain || busy} primary />
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!isConnected ? (
          <p className="py-2 text-center text-sm text-gray-500">Connect your wallet to exit.</p>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Amount (${SHARE_SYMBOL})`}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
            />
            {wrongChain && (
              <div className="rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800">
                Switch to Base Sepolia (chain {REDEMPTION_CHAIN_ID}) to transact.
              </div>
            )}

            {/* Path hint: instant vs queued */}
            {parsedShares > 0n && (
              <p className="text-[11px] text-gray-500">
                {withinBuffer
                  ? 'Within the free buffer → instant exit available.'
                  : `Above the free buffer (${fmtShares(q.instantRedeemable)} ${SHARE_SYMBOL}) → queue for pro-rata settlement at epoch close.`}
              </p>
            )}

            <div className="grid grid-cols-1 gap-2">
              <ActionButton
                label="Instant Redeem (in buffer)"
                onClick={instantRedeem}
                disabled={wrongChain || parsedShares <= 0n || !withinBuffer || busy}
                primary={withinBuffer}
              />
              <div className="grid grid-cols-2 gap-2">
                <ActionButton label={`Approve ${SHARE_SYMBOL}`} onClick={approveQueue} disabled={wrongChain || parsedShares <= 0n || busy} />
                <ActionButton
                  label="Request Redemption"
                  onClick={requestRedemption}
                  disabled={wrongChain || parsedShares <= 0n || q.paused || busy}
                  primary={!withinBuffer}
                />
              </div>
            </div>

            {busy && <p className="text-center text-xs text-gray-400">Confirm in wallet / waiting for confirmation...</p>}
            {isSuccess && (
              <p className="text-center text-xs font-medium text-emerald-600">
                Transaction confirmed.{' '}
                <button type="button" onClick={() => { setAmount(''); q.refetch(); reset(); }} className="underline">
                  reset
                </button>
              </p>
            )}
            {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error.message.slice(0, 140)}</p>}
            <p className="text-[11px] text-gray-400">
              Queued exits settle pro-rata at epoch close — under scarcity everyone receives the same
              fraction in USDC and the unsettled remainder returns as {SHARE_SYMBOL}.
            </p>
          </div>
        )}
      </div>

      <Disclaimer />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-1.5">
      <p className="text-gray-400">{label}</p>
      <p className="font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 ${
        primary ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}

function Disclaimer() {
  return (
    <div className="border-t border-gray-100 px-4 py-3">
      <p className="text-[11px] leading-snug text-gray-400">{SHARE_DISCLAIMER}</p>
    </div>
  );
}
