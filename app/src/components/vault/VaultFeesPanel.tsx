'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { INSURANCE_VAULT_ABI } from '@/config/contracts';
import { formatUSDC } from '@/lib/formatting';

/**
 * Management fees booked by the vault, and the only way to collect them.
 *
 * There was no interface for `claimFees` at all: a vault could accrue a
 * management fee indefinitely with nobody able to see the balance, let alone
 * withdraw it.
 *
 * Two things about the on-chain design are stated here rather than smoothed
 * over, because both surprise people:
 *
 *  - the fee is the curator's economics, but `claimFees` is OWNER_ROLE-gated,
 *    so the curator cannot collect it — the protocol owner does, to a recipient
 *    the owner chooses;
 *  - `accumulatedFees` is only what has been *booked*. Accrual since the last
 *    state-changing operation is not in that number, and lands there on the
 *    next one. Presenting it as the full entitlement would overstate nothing
 *    and understate something, so it is labelled for what it is.
 */
export function VaultFeesPanel({
  vaultAddress,
  managementFeeBps,
  isOwner,
}: {
  vaultAddress: `0x${string}`;
  managementFeeBps: bigint;
  isOwner: boolean;
}) {
  const { address } = useAccount();
  const [recipient, setRecipient] = useState('');
  const notified = useRef<string | null>(null);

  const { data: bookedRaw, refetch } = useReadContract({
    address: vaultAddress,
    abi: INSURANCE_VAULT_ABI,
    functionName: 'accumulatedFees',
  });
  const booked = typeof bookedRaw === 'bigint' ? bookedRaw : 0n;

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (!isSuccess || !hash || notified.current === hash) return;
    notified.current = hash;
    void refetch();
  }, [isSuccess, hash, refetch]);

  // Defaults to the connected wallet, so the common case needs no typing. It
  // stays editable because the owner may well be paying a different treasury.
  const effectiveRecipient = (recipient || address || '') as `0x${string}`;
  const validRecipient = /^0x[0-9a-fA-F]{40}$/.test(effectiveRecipient);
  const feePct = (Number(managementFeeBps) / 100).toFixed(2);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">Management fees</h3>
      <p className="mt-0.5 text-xs text-gray-500">
        {feePct}% annual on assets under management, accrued continuously.
      </p>

      <div className="mt-4 flex flex-wrap items-baseline gap-2">
        <span className="font-mono-num text-2xl font-semibold text-gray-900">
          {formatUSDC(booked)}
        </span>
        <span className="text-xs text-gray-500">booked and collectable</span>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Fees accrued since the vault&apos;s last operation are not counted here yet; they are booked
        on the next one.
      </p>

      {managementFeeBps === 0n && (
        <p className="mt-3 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
          This vault charges no management fee, so nothing will ever accrue.
        </p>
      )}

      {!isOwner ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          Collecting is <code>OWNER_ROLE</code>-gated. The management fee is the curator&apos;s
          economics, but the protocol owner performs the withdrawal and chooses the recipient — this
          wallet cannot.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Pay to
            </label>
            <input
              value={recipient || address || ''}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs focus:border-gray-400 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">Defaults to the connected wallet.</p>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
              {error.message.slice(0, 180)}
            </p>
          )}

          <button
            type="button"
            disabled={isPending || booked === 0n || !validRecipient}
            onClick={() =>
              writeContract({
                address: vaultAddress,
                abi: INSURANCE_VAULT_ABI,
                functionName: 'claimFees',
                args: [effectiveRecipient],
              })
            }
            className="rounded-full px-5 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: '#1B3A6B' }}
          >
            {isPending ? 'Confirm in wallet…' : booked === 0n ? 'Nothing to collect' : `Collect ${formatUSDC(booked)}`}
          </button>

          {isSuccess && (
            <p className="text-xs font-medium text-emerald-700">Fees collected.</p>
          )}
        </div>
      )}
    </div>
  );
}
