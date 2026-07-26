'use client';

import { useState } from 'react';
import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { useRedemptionQueue } from '@/hooks/useRedemptionQueue';
import { useVaultAddresses } from '@/hooks/useVaultData';
import { REDEMPTION_QUEUE_ABI, REDEMPTION_CHAIN_ID } from '@/config/redemption';
import { INSURANCE_VAULT_ABI } from '@/config/contracts';
import { formatUSDC, shortenAddress } from '@/lib/formatting';
import { SHARE_SYMBOL } from '@/lib/disclosure';

/**
 * Guided exit flow — one screen, one obvious next step.
 *
 * Replaces the old two-button panel (Approve / Request side by side) that gave
 * no ordering and let users sign a doomed transaction. Now:
 *
 *  1. GUARD  — the queue's bound vault must be the vault the LP actually holds.
 *              A mismatched generation is reported honestly instead of letting
 *              `requestRedemption` revert with an unreadable gas message.
 *  2. AMOUNT — one input with Max; the path (instant vs queued) is derived and
 *              stated in plain language before anything is signed.
 *  3. ALLOW  — the approval step only appears when allowance is insufficient,
 *              and only for the queued path.
 *  4. SUBMIT — a single primary action, labelled with what will happen.
 *  5. CLAIM  — surfaced when a settled epoch has proceeds waiting.
 */

const SHARE_DECIMALS = 18;
const fmtShares = (v: bigint) => Number(formatUnits(v, SHARE_DECIMALS)).toLocaleString('en-US', { maximumFractionDigits: 4 });

type Step = 1 | 2 | 3;

export function RedemptionFlow({ queueAddress }: { queueAddress?: `0x${string}` }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const q = useRedemptionQueue(queueAddress);
  const { data: protocolVaults } = useVaultAddresses();

  const [amount, setAmount] = useState('');
  const wrongChain = chainId !== REDEMPTION_CHAIN_ID;

  let parsedShares = 0n;
  try {
    parsedShares = amount ? parseUnits(amount, SHARE_DECIMALS) : 0n;
  } catch {
    parsedShares = 0n;
  }

  // Allowance drives whether the approval step is needed at all.
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: q.vault,
    abi: INSURANCE_VAULT_ABI,
    functionName: 'allowance',
    args: address && queueAddress ? [address, queueAddress] : undefined,
    query: { enabled: Boolean(q.vault && address && queueAddress) },
  });
  const allowance = typeof allowanceRaw === 'bigint' ? allowanceRaw : 0n;

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const busy = isPending || confirming;

  const withinBuffer = parsedShares > 0n && parsedShares <= q.instantRedeemable;
  const needsApproval = !withinBuffer && parsedShares > 0n && allowance < parsedShares;
  const step: Step = parsedShares <= 0n ? 1 : needsApproval ? 2 : 3;

  // --- Guard: queue not deployed ---
  if (!queueAddress || !q.available) {
    return (
      <Card title="Withdraw">
        <p className="text-sm text-gray-500">
          The redemption queue is not deployed on this network yet. Your position stays fully
          accounted for on-chain in the meantime.
        </p>
      </Card>
    );
  }

  // --- Guard: the queue is bound to a different vault generation ---
  // The LP holds shares of a protocol vault, but this queue escrows a different
  // one: requesting would transfer shares the wallet does not own on THAT vault.
  const boundVaultIsProtocolVault =
    !q.vault ||
    !protocolVaults ||
    protocolVaults.some((v) => v.toLowerCase() === q.vault!.toLowerCase());

  if (!boundVaultIsProtocolVault) {
    return (
      <Card title="Withdraw">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">Exit queue temporarily unavailable</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            The deployed redemption queue is bound to vault {shortenAddress(q.vault!)}, which is not
            one of the vaults currently listed on the protocol. Requesting an exit through it would
            fail, so the action is disabled rather than letting you sign a transaction that cannot
            succeed. This clears when the queue is redeployed against the live generation.
          </p>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Your position is unaffected: {fmtShares(q.userShares)} {SHARE_SYMBOL} remain yours on-chain.
        </p>
      </Card>
    );
  }

  if (!isConnected) {
    return (
      <Card title="Withdraw">
        <p className="text-sm text-gray-500">Connect your wallet to withdraw.</p>
      </Card>
    );
  }

  function setMax() {
    setAmount(formatUnits(q.userShares, SHARE_DECIMALS));
  }

  function submit() {
    if (!q.vault || !address || !queueAddress) return;
    if (withinBuffer) {
      writeContract({
        address: q.vault,
        abi: INSURANCE_VAULT_ABI,
        functionName: 'redeem',
        args: [parsedShares, address, address],
      });
      return;
    }
    if (needsApproval) {
      writeContract({
        address: q.vault,
        abi: INSURANCE_VAULT_ABI,
        functionName: 'approve',
        args: [queueAddress, parsedShares],
      });
      return;
    }
    writeContract({
      address: queueAddress,
      abi: REDEMPTION_QUEUE_ABI,
      functionName: 'requestRedemption',
      args: [parsedShares],
    });
  }

  const noticeDays = Math.max(1, Math.round(q.epochDurationSec / 86_400));

  return (
    <Card title="Withdraw">
      {/* Claimable proceeds from a settled epoch come first: it is free money waiting. */}
      {q.claimable?.settled && !q.claimable.alreadyClaimed && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-medium text-emerald-900">Your withdrawal is ready</p>
          <p className="mt-1 text-xs text-emerald-800">
            {formatUSDC(q.claimable.assetsPaid)} USDC
            {q.claimable.sharesReturned > 0n && ` + ${fmtShares(q.claimable.sharesReturned)} ${SHARE_SYMBOL} returned`}
          </p>
          <button
            type="button"
            onClick={() =>
              writeContract({
                address: queueAddress,
                abi: REDEMPTION_QUEUE_ABI,
                functionName: 'claim',
                args: [q.claimable!.epochId],
              })
            }
            disabled={wrongChain || busy}
            className="mt-2 rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Collect funds
          </button>
        </div>
      )}

      {/* Pending request: nothing to do but wait — say so instead of showing buttons. */}
      {q.openEpochRequested > 0n && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-medium text-gray-900">
            {fmtShares(q.openEpochRequested)} {SHARE_SYMBOL} queued
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Settles at the end of the current {noticeDays}-day window, pro-rata with every other
            exiting LP. You will be able to collect the USDC here once it settles.
          </p>
        </div>
      )}

      {/* Step 1 — amount */}
      <StepRow n={1} active={step === 1} done={step > 1} label="How much do you want to withdraw?" />
      <div className="mb-4 mt-2">
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={setMax}
            className="shrink-0 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Max
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          You hold {fmtShares(q.userShares)} {SHARE_SYMBOL} · {fmtShares(q.instantRedeemable)} available immediately
        </p>
        {parsedShares > q.userShares && (
          <p className="mt-1 text-xs text-red-600">More than you hold.</p>
        )}
      </div>

      {/* Path explanation, before anything is signed */}
      {parsedShares > 0n && parsedShares <= q.userShares && (
        <div className="mb-4 rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-700">
          {withinBuffer ? (
            <>
              <strong>Immediate withdrawal.</strong> This amount fits the vault&apos;s free liquidity
              buffer, so you receive USDC in a single transaction.
            </>
          ) : (
            <>
              <strong>Queued withdrawal ({noticeDays}-day notice).</strong> This is above the free
              buffer, so it joins the current window and settles pro-rata at close — the same
              fraction for everyone, which is what prevents a first-come run on the vault. Any
              unsettled remainder comes back to you as {SHARE_SYMBOL}.
            </>
          )}
        </div>
      )}

      {/* Step 2 — approval (only when actually required) */}
      {!withinBuffer && parsedShares > 0n && (
        <StepRow
          n={2}
          active={step === 2}
          done={step > 2}
          label={needsApproval ? `Allow the queue to hold your ${SHARE_SYMBOL}` : `${SHARE_SYMBOL} allowance granted`}
        />
      )}

      {/* Step 3 — submit */}
      <StepRow
        n={withinBuffer || parsedShares <= 0n ? 2 : 3}
        active={step === 3}
        done={false}
        label={withinBuffer ? 'Receive your USDC' : 'Join the withdrawal window'}
      />

      {wrongChain && (
        <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800">
          Switch to Base Sepolia (chain {REDEMPTION_CHAIN_ID}) to continue.
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={wrongChain || parsedShares <= 0n || parsedShares > q.userShares || q.paused || busy}
        className="mt-4 w-full rounded-full bg-[#1B3A6B] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy
          ? 'Confirm in your wallet…'
          : parsedShares <= 0n
            ? 'Enter an amount'
            : withinBuffer
              ? 'Withdraw now'
              : needsApproval
                ? `Step 2 of 3 — approve ${SHARE_SYMBOL}`
                : 'Step 3 of 3 — request withdrawal'}
      </button>

      {isSuccess && (
        <p className="mt-2 text-center text-xs font-medium text-emerald-600">
          Done.{' '}
          <button
            type="button"
            onClick={() => {
              setAmount('');
              q.refetch();
              void refetchAllowance();
              reset();
            }}
            className="underline"
          >
            start another
          </button>
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
          {humanizeError(error.message)}
        </p>
      )}
    </Card>
  );
}

/** Wallet errors are unreadable; map the ones we can explain. */
function humanizeError(message: string): string {
  if (/gas limit|intrinsic gas|estimate/i.test(message)) {
    return 'The network refused to simulate this transaction, which usually means it would fail on-chain. Nothing was sent and no funds moved.';
  }
  if (/user rejected|denied/i.test(message)) return 'You cancelled the transaction in your wallet.';
  if (/insufficient/i.test(message)) return 'Insufficient balance for this action.';
  return message.slice(0, 160);
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

function StepRow({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          done ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-[#1B3A6B] text-white' : 'bg-gray-100 text-gray-400'
        }`}
      >
        {done ? '✓' : n}
      </span>
      <span className={`text-xs ${active ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{label}</span>
    </div>
  );
}
