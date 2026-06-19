'use client';

import { useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { operatorAuthMessage } from '@/lib/kyb/schema';

/**
 * Append-only audit trail for one claim — every on-chain Claim* / Receipt*
 * log surfaced from the off-chain mirror. Same UX shape as EvidencePanel:
 * click to sign, then render. We do NOT auto-fetch in the background to
 * avoid prompting for a signature every render. Backend-unavailable
 * degrades to a polite message rather than inventing rows.
 *
 * The on-chain block + tx hash give the reader a verifiable anchor — they
 * can always open the explorer link to confirm the row matches a real log.
 */

interface AuditRow {
  id: string;
  event_name: string;
  block_number: number;
  log_index: number;
  tx_hash: string;
  contract_addr: string;
  actor: string | null;
  data: Record<string, unknown>;
  ts: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'unavailable' }
  | { kind: 'signing' }
  | { kind: 'loading' }
  | { kind: 'ready'; rows: AuditRow[] }
  | { kind: 'error'; message: string };

function shortAddr(a: string | null): string {
  if (!a) return '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function blockExplorerTx(hash: string): string {
  return `https://sepolia.basescan.org/tx/${hash}`;
}

export function AuditTrailPanel({ claimId }: { claimId: bigint }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/audit/claims/status');
        const j = (await r.json()) as { available: boolean };
        if (!cancelled) setAvailable(!!j.available);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadTrail() {
    if (!isConnected || !address) {
      setPhase({ kind: 'error', message: 'Connect your wallet.' });
      return;
    }
    if (available === false) {
      setPhase({ kind: 'unavailable' });
      return;
    }
    setPhase({ kind: 'signing' });
    const ts = Math.floor(Date.now() / 1000);
    const action = `audit:list:${claimId}`;
    let signature: `0x${string}`;
    try {
      signature = await signMessageAsync({ message: operatorAuthMessage(action, ts) });
    } catch {
      setPhase({ kind: 'error', message: 'Signature declined.' });
      return;
    }
    setPhase({ kind: 'loading' });
    try {
      const qs = new URLSearchParams({ address, timestamp: String(ts), signature });
      const res = await fetch(`/api/audit/claims/${claimId}?${qs}`);
      if (res.status === 503) {
        setPhase({ kind: 'unavailable' });
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setPhase({ kind: 'error', message: j.error ?? `HTTP ${res.status}` });
        return;
      }
      const j = (await res.json()) as { trail: AuditRow[] };
      setPhase({ kind: 'ready', rows: j.trail ?? [] });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message.slice(0, 120) : 'fetch failed' });
    }
  }

  if (available === false) {
    return (
      <div className="rounded-lg border border-gray-100 p-3">
        <p className="mb-1 text-xs font-medium text-gray-700">Audit trail</p>
        <p className="text-[11px] text-gray-400">Audit backend not configured on this deployment.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <p className="mb-1 text-xs font-medium text-gray-700">Audit trail</p>
      <p className="mb-2 text-[11px] text-gray-400">Immutable mirror of on-chain claim logs.</p>

      {!isConnected ? (
        <p className="text-xs text-gray-500">Connect your wallet to view the audit trail.</p>
      ) : phase.kind === 'idle' || phase.kind === 'error' ? (
        <button
          type="button"
          onClick={() => void loadTrail()}
          className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-200"
        >
          View audit trail
        </button>
      ) : phase.kind === 'signing' ? (
        <p className="text-xs text-gray-500">Sign in your wallet to view the audit trail…</p>
      ) : phase.kind === 'loading' ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : phase.kind === 'unavailable' ? (
        <p className="text-xs text-gray-400">Audit backend not configured on this deployment.</p>
      ) : (
        <>
          {phase.rows.length === 0 ? (
            <p className="text-xs text-gray-400">No audit entries yet.</p>
          ) : (
            <ul className="space-y-1">
              {phase.rows.map((r) => (
                <li
                  key={r.id}
                  className="rounded border border-gray-50 bg-gray-50/40 p-2 text-[11px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-800">{r.event_name}</span>
                    <a
                      href={blockExplorerTx(r.tx_hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-700 hover:underline"
                    >
                      block {r.block_number} · log {r.log_index} ↗
                    </a>
                  </div>
                  <div className="mt-0.5 text-gray-500">
                    actor {shortAddr(r.actor)} · {new Date(r.ts).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {phase.kind === 'error' && <p className="mt-2 text-xs text-red-600">{phase.message}</p>}
    </div>
  );
}
