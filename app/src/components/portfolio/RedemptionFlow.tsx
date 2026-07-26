'use client';

import { useState } from 'react';
import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { useRedemptionQueue } from '@/hooks/useRedemptionQueue';
import { useLpPositions, type LpPosition } from '@/hooks/useLpPositions';
import { REDEMPTION_QUEUE_ABI, REDEMPTION_CHAIN_ID } from '@/config/redemption';
import { INSURANCE_VAULT_ABI } from '@/config/contracts';
import { formatUSDC, shortenAddress } from '@/lib/formatting';
import { SHARE_SYMBOL } from '@/lib/disclosure';

/**
 * Guided exit flow — one screen, one obvious next step.
 *
 *  0. VAULT  — every vault the protocol has deployed is listed, each stating
 *              whether this wallet holds anything in it. The screen used to
 *              show only the vault the redemption queue happened to be bound
 *              to, so an LP with shares anywhere else saw a zero balance and no
 *              reason for it.
 *  1. AMOUNT — one input with Max; the path is derived and stated in plain
 *              language before anything is signed.
 *  2. ALLOW  — the approval step appears only when allowance is insufficient,
 *              and only for the queued path.
 *  3. SUBMIT — a single primary action, labelled with what will happen.
 *  4. CLAIM  — surfaced when a settled epoch has proceeds waiting.
 *
 * The two exit paths do not live in the same place, and that is what decides
 * what the screen may offer. `redeem` is a function of the VAULT, so an
 * immediate withdrawal within the free buffer works on any vault the wallet
 * holds. The queue is a separate contract bound to ONE vault, so the queued
 * path exists only for that vault; for the others the panel says so instead of
 * offering a button that would revert.
 */

const SHARE_DECIMALS = 18;
const fmtShares = (v: bigint) =>
  Number(formatUnits(v, SHARE_DECIMALS)).toLocaleString('en-US', { maximumFractionDigits: 4 });

type Step = 1 | 2 | 3;

export function RedemptionFlow({ queueAddress }: { queueAddress?: `0x${string}` }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const q = useRedemptionQueue(queueAddress);
  const positions = useLpPositions();

  const [selected, setSelected] = useState<`0x${string}` | ''>('');
  const [amount, setAmount] = useState('');
  const wrongChain = chainId !== REDEMPTION_CHAIN_ID;

  // The default selection is derived, never written from an effect: the vault
  // with the largest holding, falling back to the queue's vault, then the first
  // vault the factory lists.
  const largestHeld = positions.held.reduce<LpPosition | null>(
    (best, p) => (best === null || p.shares > best.shares ? p : best),
    null,
  );
  const defaultVault =
    largestHeld?.address ??
    (q.vault && positions.all.some((p) => p.address === q.vault) ? q.vault : positions.all[0]?.address);
  const activeAddress = (selected || defaultVault) as `0x${string}` | undefined;
  const active = positions.all.find((p) => p.address === activeAddress);

  const isQueueVault =
    !!q.available && !!q.vault && !!activeAddress && q.vault.toLowerCase() === activeAddress.toLowerCase();

  const heldShares = active?.shares ?? 0n;
  const instantRedeemable = active?.instantRedeemable ?? 0n;

  let parsedShares = 0n;
  try {
    parsedShares = amount ? parseUnits(amount, SHARE_DECIMALS) : 0n;
  } catch {
    parsedShares = 0n;
  }

  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: activeAddress,
    abi: INSURANCE_VAULT_ABI,
    functionName: 'allowance',
    args: address && queueAddress ? [address, queueAddress] : undefined,
    query: { enabled: Boolean(activeAddress && address && queueAddress && isQueueVault) },
  });
  const allowance = typeof allowanceRaw === 'bigint' ? allowanceRaw : 0n;

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const busy = isPending || confirming;

  const withinBuffer = parsedShares > 0n && parsedShares <= instantRedeemable;
  // Above the buffer there is only one way out, and it exists only on the vault
  // the queue is bound to.
  const queueUnavailable = !withinBuffer && parsedShares > 0n && !isQueueVault;
  const needsApproval = !withinBuffer && parsedShares > 0n && isQueueVault && allowance < parsedShares;
  const step: Step = parsedShares <= 0n ? 1 : needsApproval ? 2 : 3;

  if (!isConnected) {
    return (
      <Card title="Withdraw">
        <p className="text-sm text-gray-500">Connect your wallet to withdraw.</p>
      </Card>
    );
  }

  function setMax() {
    setAmount(formatUnits(heldShares, SHARE_DECIMALS));
  }

  function submit() {
    if (!activeAddress || !address) return;
    if (withinBuffer) {
      writeContract({
        address: activeAddress,
        abi: INSURANCE_VAULT_ABI,
        functionName: 'redeem',
        args: [parsedShares, address, address],
      });
      return;
    }
    if (!isQueueVault || !queueAddress) return;
    if (needsApproval) {
      writeContract({
        address: activeAddress,
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
  const submitDisabled =
    wrongChain || parsedShares <= 0n || parsedShares > heldShares || queueUnavailable || q.paused || busy;

  return (
    <Card title="Withdraw">
      {/* Claimable proceeds from a settled epoch come first: it is money waiting. */}
      {q.claimable?.settled && !q.claimable.alreadyClaimed && queueAddress && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-medium text-emerald-900">Your withdrawal is ready</p>
          <p className="mt-1 text-xs text-emerald-800">
            {formatUSDC(q.claimable.assetsPaid)} USDC
            {q.claimable.sharesReturned > 0n &&
              ` + ${fmtShares(q.claimable.sharesReturned)} ${SHARE_SYMBOL} returned`}
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

      {/* Step 0 — which vault */}
      <VaultPicker
        positions={positions}
        activeAddress={activeAddress}
        queueVault={q.available ? q.vault : undefined}
        onSelect={(a) => {
          setSelected(a);
          setAmount('');
          reset();
        }}
      />

      {active?.unreadable && (
        <p className="mb-4 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          This vault did not answer the balance read, so your position in it is unknown rather than
          zero. Nothing is offered here until it responds.
        </p>
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
            disabled={heldShares === 0n}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            type="button"
            onClick={setMax}
            disabled={heldShares === 0n}
            className="shrink-0 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            Max
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {heldShares === 0n ? (
            <>You hold no {SHARE_SYMBOL} in this vault — pick one above where you have a position.</>
          ) : (
            <>
              You hold {fmtShares(heldShares)} {SHARE_SYMBOL} here ·{' '}
              {fmtShares(instantRedeemable)} available immediately
            </>
          )}
        </p>
        {parsedShares > heldShares && <p className="mt-1 text-xs text-red-600">More than you hold.</p>}
      </div>

      {/* Path explanation, before anything is signed */}
      {parsedShares > 0n && parsedShares <= heldShares && (
        <div
          className={`mb-4 rounded-lg p-3 text-xs leading-5 ${
            queueUnavailable ? 'border border-amber-200 bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-700'
          }`}
        >
          {withinBuffer ? (
            <>
              <strong>Immediate withdrawal.</strong> This amount fits the vault&apos;s free liquidity
              buffer, so you receive USDC in a single transaction.
            </>
          ) : queueUnavailable ? (
            <>
              <strong>Above this vault&apos;s free buffer.</strong> Larger exits go through the
              redemption queue, and the deployed queue is bound to vault{' '}
              {q.vault ? shortenAddress(q.vault) : 'another vault'} — not this one. Withdraw up to{' '}
              {fmtShares(instantRedeemable)} {SHARE_SYMBOL} immediately, or wait for a queue bound to
              this vault. Signing anything else here would revert.
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
      {!withinBuffer && parsedShares > 0n && isQueueVault && (
        <StepRow
          n={2}
          active={step === 2}
          done={step > 2}
          label={
            needsApproval
              ? `Allow the queue to hold your ${SHARE_SYMBOL}`
              : `${SHARE_SYMBOL} allowance granted`
          }
        />
      )}

      {/* Step 3 — submit */}
      <StepRow
        n={withinBuffer || parsedShares <= 0n || !isQueueVault ? 2 : 3}
        active={step === 3 && !queueUnavailable}
        done={false}
        label={withinBuffer || queueUnavailable ? 'Receive your USDC' : 'Join the withdrawal window'}
      />

      {wrongChain && (
        <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800">
          Switch to Base Sepolia (chain {REDEMPTION_CHAIN_ID}) to continue.
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitDisabled}
        className="mt-4 w-full rounded-full bg-[#1B3A6B] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy
          ? 'Confirm in your wallet…'
          : parsedShares <= 0n
            ? 'Enter an amount'
            : queueUnavailable
              ? `Reduce to ${fmtShares(instantRedeemable)} or less`
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
              positions.refetch();
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
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{humanizeError(error.message)}</p>
      )}
    </Card>
  );
}

/**
 * Every deployed vault, each stating this wallet's position in it up front —
 * the answer to "do I have anything here" should not require selecting first
 * and reading a balance second.
 */
function VaultPicker({
  positions,
  activeAddress,
  queueVault,
  onSelect,
}: {
  positions: ReturnType<typeof useLpPositions>;
  activeAddress?: `0x${string}`;
  queueVault?: `0x${string}`;
  onSelect: (a: `0x${string}`) => void;
}) {
  if (positions.loading) {
    return <div className="mb-4 h-24 animate-pulse rounded-lg bg-gray-100" />;
  }
  if (positions.all.length === 0) {
    return (
      <p className="mb-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
        No vaults are deployed on this network yet.
      </p>
    );
  }

  return (
    <div className="mb-4">
      <StepRow n={0} active={false} done label="Which vault are you withdrawing from?" />
      <ul className="mt-2 space-y-1.5">
        {positions.all.map((p) => {
          const isActive = p.address === activeAddress;
          const isQueue = !!queueVault && queueVault.toLowerCase() === p.address.toLowerCase();
          return (
            <li key={p.address}>
              <button
                type="button"
                onClick={() => onSelect(p.address)}
                aria-pressed={isActive}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
                  isActive ? 'border-[#1B3A6B] bg-[#1B3A6B]/[0.04]' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-gray-900">{p.name}</span>
                  <span className="block text-[11px] text-gray-400">{shortenAddress(p.address)}</span>
                </span>
                <span className="shrink-0 text-right">
                  {p.unreadable ? (
                    <span className="text-[11px] font-medium text-amber-700">Position unknown</span>
                  ) : p.shares > 0n ? (
                    <>
                      <span className="block text-xs font-semibold text-emerald-700">
                        {fmtShares(p.shares)} {SHARE_SYMBOL}
                      </span>
                      <span className="block text-[11px] text-gray-400">
                        {fmtShares(p.instantRedeemable)} instant
                        {isQueue ? ' · queue' : ''}
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px] text-gray-400">No position</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
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
