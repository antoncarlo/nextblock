'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { operatorAuthMessage } from '@/lib/kyb/schema';
import { BORDEREAU_ORACLE_ABI } from '@/config/contracts';
import { NEXTBLOCK_ADDRESSES } from '@/config/generated/addressBook';

/**
 * Sentinel queue: bordereau assertions awaiting on-chain propose.
 *
 * Mirror of /app/admin/ai-assessments. Per row: read-only display of the
 * persisted draft + a 'Propose on-chain' button that calls
 * BordereauOracle.proposeAssertion with the EXACT persisted args, then
 * POSTs the tx hash back to mark the row 'proposed'.
 *
 * On-chain auth: proposeAssertion requires AUTHORIZED_CEDANT_ROLE or
 * ORACLE_ROLE on the signing wallet — tx reverts otherwise.
 */

interface Row {
  id: string;
  portfolio_id: number;
  assertion_type: number;
  data_hash: `0x${string}`;
  data_uri: string;
  declared_amount: string;
  submitted_by: string;
  created_at: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'loading' }
  | { kind: 'ready'; rows: Row[] }
  | { kind: 'error'; message: string };

const ASSERTION_LABEL: Record<number, string> = {
  0: 'Premium bordereau',
  1: 'Loss bordereau',
  2: 'Aggregate exposure',
};

export default function BordereauAdminPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const load = useCallback(async () => {
    if (!isConnected || !address) {
      setPhase({ kind: 'error', message: 'Connect your wallet.' });
      return;
    }
    setPhase({ kind: 'signing' });
    const ts = Math.floor(Date.now() / 1000);
    let signature: `0x${string}`;
    try {
      signature = await signMessageAsync({ message: operatorAuthMessage('bordereau:pending:list', ts) });
    } catch {
      setPhase({ kind: 'error', message: 'Signature declined.' });
      return;
    }
    setPhase({ kind: 'loading' });
    try {
      const qs = new URLSearchParams({ address, timestamp: String(ts), signature });
      const res = await fetch(`/api/bordereau/pending?${qs}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setPhase({ kind: 'error', message: j.error ?? `HTTP ${res.status}` });
        return;
      }
      const j = (await res.json()) as { assertions: Row[] };
      setPhase({ kind: 'ready', rows: j.assertions ?? [] });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'fetch failed' });
    }
  }, [address, isConnected, signMessageAsync]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Bordereau — pending propose</h1>
      <p className="mt-1 text-sm text-gray-500">
        Off-chain bordereau drafts awaiting on-chain <code>BordereauOracle.proposeAssertion</code>. Signing
        wallet must hold <code>AUTHORIZED_CEDANT_ROLE</code> or <code>ORACLE_ROLE</code>.
      </p>

      <div className="mt-4">
        {phase.kind === 'idle' || phase.kind === 'error' ? (
          <button
            type="button"
            onClick={() => void load()}
            disabled={!isConnected}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isConnected ? 'Sign & load queue' : 'Connect wallet to load'}
          </button>
        ) : phase.kind === 'signing' ? (
          <p className="text-sm text-gray-600">Signing…</p>
        ) : phase.kind === 'loading' ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : null}
      </div>

      {phase.kind === 'error' && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{phase.message}</div>
      )}

      {phase.kind === 'ready' && (
        <div className="mt-6 space-y-3">
          {phase.rows.length === 0 ? (
            <p className="text-sm text-gray-500">No pending bordereau assertions. ✓</p>
          ) : (
            phase.rows.map((r) => (
              <PendingBordereauRow
                key={r.id}
                row={r}
                walletAddress={address!}
                signMessageAsync={signMessageAsync}
                onProposed={() =>
                  setPhase({
                    kind: 'ready',
                    rows: phase.rows.filter((x) => x.id !== r.id),
                  })
                }
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PendingBordereauRow({
  row,
  walletAddress,
  signMessageAsync,
  onProposed,
}: {
  row: Row;
  walletAddress: `0x${string}`;
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>;
  onProposed: () => void;
}) {
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });
  const [error, setError] = useState<string | null>(null);

  const propose = () => {
    setError(null);
    try {
      writeContract({
        address: NEXTBLOCK_ADDRESSES.bordereauOracle as `0x${string}`,
        abi: BORDEREAU_ORACLE_ABI,
        functionName: 'proposeAssertion',
        args: [BigInt(row.portfolio_id), row.assertion_type, row.data_hash, row.data_uri, BigInt(row.declared_amount)],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 200) : 'propose failed');
    }
  };

  useEffect(() => {
    if (!receipt.isSuccess || !txHash) return;
    (async () => {
      try {
        const ts = Math.floor(Date.now() / 1000);
        const signature = await signMessageAsync({
          message: operatorAuthMessage(`bordereau:pending:proposed:${row.id}`, ts),
        });
        const res = await fetch(`/api/bordereau/pending/${row.id}/proposed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            txHash,
            auth: { address: walletAddress, timestamp: ts, signature },
          }),
        });
        if (res.ok) onProposed();
      } catch (e) {
        setError(e instanceof Error ? e.message.slice(0, 200) : 'post-back failed');
      }
    })();
  }, [receipt.isSuccess, txHash, row.id, walletAddress, signMessageAsync, onProposed]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Portfolio #{row.portfolio_id}</h3>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
          {ASSERTION_LABEL[row.assertion_type] ?? `type ${row.assertion_type}`}
        </span>
      </div>
      <div className="mt-2 text-[11px]">
        <Metric label="Declared amount" value={`${(Number(row.declared_amount) / 1_000_000).toLocaleString()} USDC`} />
        <div className="mt-1 break-all text-[10px] text-gray-400">dataHash: {row.data_hash}</div>
        <div className="mt-0.5 break-all text-[10px] text-gray-400">dataURI: {row.data_uri}</div>
        <div className="mt-0.5 text-[10px] text-gray-400">
          submittedBy: {row.submitted_by.slice(0, 10)}… · {new Date(row.created_at).toLocaleString()}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={propose}
          disabled={isPending || receipt.isLoading || receipt.isSuccess}
          className="rounded-md bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {isPending
            ? 'Sign tx…'
            : receipt.isLoading
              ? 'Proposing…'
              : receipt.isSuccess
                ? 'Proposed ✓'
                : 'Propose on-chain'}
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-xs font-medium text-gray-900">{value}</div>
    </div>
  );
}
