'use client';

import { useCallback, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { operatorAuthMessage } from '@/lib/kyb/schema';

/**
 * Sentinel sanctions review queue. Read-only list of `pending_sentinel`
 * matches with two actions per row:
 *   - "False positive" → record decision; Sentinel then re-runs the KYB
 *     approve (which will pass screening on no-match) and may setWhitelist
 *     from their existing tooling.
 *   - "True match"     → record decision; Sentinel must then call
 *     ComplianceRegistry.setBlocked(wallet, true) from Safe.
 *
 * The on-chain action is intentionally NOT triggered from this page —
 * same posture as the KYB approve → setWhitelist split. This UI is the
 * compliance audit surface; the chain write is a separate, explicit act.
 */

interface MatchRow {
  id: string;
  kyb_application_id: string | null;
  matched_name: string;
  sanctions_list: string;
  severity: 'low' | 'medium' | 'high' | 'unknown';
  match_score: number | null;
  evidence: Record<string, unknown> | null;
  created_at: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'loading' }
  | { kind: 'ready'; rows: MatchRow[] }
  | { kind: 'error'; message: string };

function severityColor(s: MatchRow['severity']): string {
  if (s === 'high') return '#b91c1c';
  if (s === 'medium') return '#b45309';
  if (s === 'low') return '#1e40af';
  return '#6b7280';
}

export default function SanctionsReviewPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [acting, setActing] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    if (!isConnected || !address) {
      setPhase({ kind: 'error', message: 'Connect your wallet.' });
      return;
    }
    setPhase({ kind: 'signing' });
    const ts = Math.floor(Date.now() / 1000);
    let signature: `0x${string}`;
    try {
      signature = await signMessageAsync({
        message: operatorAuthMessage('sanctions:matches:list', ts),
      });
    } catch {
      setPhase({ kind: 'error', message: 'Signature declined.' });
      return;
    }
    setPhase({ kind: 'loading' });
    try {
      const qs = new URLSearchParams({ address, timestamp: String(ts), signature });
      const res = await fetch(`/api/sanctions/matches?${qs}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setPhase({ kind: 'error', message: j.error ?? `HTTP ${res.status}` });
        return;
      }
      const j = (await res.json()) as { matches: MatchRow[] };
      setPhase({ kind: 'ready', rows: j.matches ?? [] });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'fetch failed' });
    }
  }, [address, isConnected, signMessageAsync]);

  const resolve = useCallback(
    async (matchId: string, resolution: 'false_positive' | 'true_match', note: string) => {
      if (!isConnected || !address || phase.kind !== 'ready') return;
      setActing(matchId);
      const ts = Math.floor(Date.now() / 1000);
      let signature: `0x${string}`;
      try {
        signature = await signMessageAsync({
          message: operatorAuthMessage(`sanctions:resolve:${matchId}:${resolution}`, ts),
        });
      } catch {
        setActing(null);
        return;
      }
      try {
        const res = await fetch(`/api/sanctions/matches/${matchId}/resolve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            resolution,
            note: note || undefined,
            auth: { address, timestamp: ts, signature },
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setPhase({ kind: 'error', message: j.error ?? `HTTP ${res.status}` });
          setActing(null);
          return;
        }
        // Drop the resolved row from the local list.
        setPhase({
          kind: 'ready',
          rows: phase.rows.filter((r) => r.id !== matchId),
        });
      } finally {
        setActing(null);
      }
    },
    [address, isConnected, phase, signMessageAsync],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">Sanctions review queue</h1>
      <p className="mt-1 text-sm text-gray-500">
        Pending sanctions / PEP / adverse-media matches from KYB onboarding and monthly re-screen.
        Decisions here are audit-of-record; the on-chain <code>setBlocked</code> /{' '}
        <code>setWhitelist</code> call is a separate Sentinel act (Safe).
      </p>

      <div className="mt-4 flex items-center gap-2">
        {phase.kind === 'idle' || phase.kind === 'error' ? (
          <button
            type="button"
            onClick={() => void loadQueue()}
            disabled={!isConnected}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isConnected ? 'Sign & load queue' : 'Connect wallet to load'}
          </button>
        ) : phase.kind === 'signing' ? (
          <p className="text-sm text-gray-600">Sign in your wallet to view the queue…</p>
        ) : phase.kind === 'loading' ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : null}
      </div>

      {phase.kind === 'error' && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {phase.message}
        </div>
      )}

      {phase.kind === 'ready' && (
        <div className="mt-6">
          {phase.rows.length === 0 ? (
            <p className="text-sm text-gray-500">No pending matches. ✓</p>
          ) : (
            <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
              {phase.rows.map((m) => (
                <SanctionsMatchRow
                  key={m.id}
                  row={m}
                  busy={acting === m.id}
                  onResolve={(resolution, note) => void resolve(m.id, resolution, note)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SanctionsMatchRow({
  row,
  busy,
  onResolve,
}: {
  row: MatchRow;
  busy: boolean;
  onResolve: (resolution: 'false_positive' | 'true_match', note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <li className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{row.matched_name}</span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
              style={{ backgroundColor: severityColor(row.severity) }}
            >
              {row.severity}
            </span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
              {row.sanctions_list}
            </span>
            {row.match_score !== null && (
              <span className="text-[11px] text-gray-500">score {row.match_score.toFixed(2)}</span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            KYB application {row.kyb_application_id?.slice(0, 8) ?? '—'} ·{' '}
            {new Date(row.created_at).toLocaleString()}
          </p>
          {row.evidence && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-gray-500">Evidence</summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-50 p-2 text-[10px] text-gray-700">
                {JSON.stringify(row.evidence, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="resolution note (optional)"
          className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={() => onResolve('false_positive', note)}
          disabled={busy}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          False positive
        </button>
        <button
          type="button"
          onClick={() => onResolve('true_match', note)}
          disabled={busy}
          className="rounded-md bg-red-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
        >
          True match → block
        </button>
      </div>
    </li>
  );
}
