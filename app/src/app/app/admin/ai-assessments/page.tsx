'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { operatorAuthMessage } from '@/lib/kyb/schema';
import { AI_ASSESSOR_ABI } from '@/config/contracts';
import { NEXTBLOCK_ADDRESSES } from '@/config/generated/addressBook';

/**
 * Sentinel queue: AI assessments pending on-chain publish.
 *
 * Flow per row:
 *   1. Read-only display of the off-chain assessment (scores, recommendation,
 *      sourceHash, raw provider response)
 *   2. "Publish on-chain" button → wagmi writeContract on AIAssessor.publishAssessment
 *      using the EXACT args persisted at assessment time, so the on-chain
 *      data is reproducible from the same sourceHash
 *   3. On confirmation → POST /api/ai/pending/[id]/published with the tx hash;
 *      row drops from the queue
 *
 * On-chain auth: AIAssessor.publishAssessment is gated by ORACLE_ROLE. The
 * Sentinel wallet shown here must have that role on-chain or the tx reverts.
 */

interface PendingRow {
  id: string;
  claim_id: number;
  score_bps: number;
  anomaly_score_bps: number;
  confidence_bps: number;
  recommendation: 0 | 1 | 2;
  recommended_amount: string;
  source_hash: `0x${string}`;
  provider: string;
  raw_response: Record<string, unknown> | null;
  created_at: string;
}

type Phase = { kind: 'idle' } | { kind: 'signing' } | { kind: 'loading' } | { kind: 'ready'; rows: PendingRow[] } | { kind: 'error'; message: string };

const RECOMMENDATION_LABEL: Record<0 | 1 | 2, { label: string; color: string }> = {
  0: { label: 'APPROVE', color: 'text-emerald-700' },
  1: { label: 'REVIEW', color: 'text-amber-700' },
  2: { label: 'REJECT', color: 'text-red-700' },
};

export default function AIAssessmentsPage() {
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
      signature = await signMessageAsync({ message: operatorAuthMessage('ai:pending:list', ts) });
    } catch {
      setPhase({ kind: 'error', message: 'Signature declined.' });
      return;
    }
    setPhase({ kind: 'loading' });
    try {
      const qs = new URLSearchParams({ address, timestamp: String(ts), signature });
      const res = await fetch(`/api/ai/pending?${qs}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setPhase({ kind: 'error', message: j.error ?? `HTTP ${res.status}` });
        return;
      }
      const j = (await res.json()) as { assessments: PendingRow[] };
      setPhase({ kind: 'ready', rows: j.assessments ?? [] });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'fetch failed' });
    }
  }, [address, isConnected, signMessageAsync]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">AI assessments — pending publish</h1>
      <p className="mt-1 text-sm text-gray-500">
        Off-chain assessment drafts awaiting on-chain <code>AIAssessor.publishAssessment</code>. The
        Sentinel wallet must hold <code>ORACLE_ROLE</code>.
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
            <p className="text-sm text-gray-500">No pending assessments. ✓</p>
          ) : (
            phase.rows.map((r) => (
              <PendingAssessmentRow
                key={r.id}
                row={r}
                walletAddress={address!}
                signMessageAsync={signMessageAsync}
                onPublished={() =>
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

function PendingAssessmentRow({
  row,
  walletAddress,
  signMessageAsync,
  onPublished,
}: {
  row: PendingRow;
  walletAddress: `0x${string}`;
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>;
  onPublished: () => void;
}) {
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });
  const [error, setError] = useState<string | null>(null);

  const rec = RECOMMENDATION_LABEL[row.recommendation];

  const publish = () => {
    setError(null);
    try {
      writeContract({
        address: NEXTBLOCK_ADDRESSES.aiAssessor as `0x${string}`,
        abi: AI_ASSESSOR_ABI,
        functionName: 'publishAssessment',
        args: [
          BigInt(row.claim_id),
          row.score_bps,
          row.anomaly_score_bps,
          row.confidence_bps,
          row.recommendation,
          BigInt(row.recommended_amount),
          row.source_hash,
        ],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 200) : 'publish failed');
    }
  };

  // Post back when receipt confirms.
  useEffect(() => {
    if (!receipt.isSuccess || !txHash) return;
    (async () => {
      try {
        const ts = Math.floor(Date.now() / 1000);
        const signature = await signMessageAsync({
          message: operatorAuthMessage(`ai:pending:published:${row.id}`, ts),
        });
        const res = await fetch(`/api/ai/pending/${row.id}/published`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            txHash,
            auth: { address: walletAddress, timestamp: ts, signature },
          }),
        });
        if (res.ok) onPublished();
      } catch (e) {
        setError(e instanceof Error ? e.message.slice(0, 200) : 'post-back failed');
      }
    })();
  }, [receipt.isSuccess, txHash, row.id, walletAddress, signMessageAsync, onPublished]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Claim #{row.claim_id}</h3>
        <span className={`text-xs font-semibold ${rec.color}`}>{rec.label}</span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-3 text-[11px]">
        <Metric label="Score" value={`${row.score_bps / 100}%`} />
        <Metric label="Anomaly" value={`${row.anomaly_score_bps / 100}%`} />
        <Metric label="Confidence" value={`${row.confidence_bps / 100}%`} />
        <Metric label="Recommended" value={`${(Number(row.recommended_amount) / 1_000_000).toLocaleString()} USDC`} />
      </div>
      <div className="mt-2 break-all text-[10px] text-gray-400">
        sourceHash: {row.source_hash} · provider: {row.provider}
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={publish}
          disabled={isPending || receipt.isLoading || receipt.isSuccess}
          className="rounded-md bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {isPending
            ? 'Sign tx…'
            : receipt.isLoading
              ? 'Publishing…'
              : receipt.isSuccess
                ? 'Published ✓'
                : 'Publish on-chain'}
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
