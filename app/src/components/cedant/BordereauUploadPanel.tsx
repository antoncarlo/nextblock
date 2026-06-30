'use client';

import { useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { operatorAuthMessage } from '@/lib/kyb/schema';
import { keccak256Hex } from '@/lib/evidence/hash';

/**
 * Bordereau upload (cedant side).
 *
 * Two-step UX:
 *   1. Pick file + portfolio id + assertion type + declared amount
 *   2. Sign action `bordereau:upload:<portfolioId>:<contentHash>` and POST
 *      the multipart payload to /api/bordereau/upload
 *
 * The server stores the bytes in the private `bordereau-files` Storage bucket
 * (private signed URLs only) and inserts a `bordereau_assertions_pending` row
 * keyed by (portfolio_id, contentHash). Sentinel publishes the assertion
 * on-chain from /app/admin/bordereau.
 *
 * Backend-unavailable degrades to a polite message instead of inventing state.
 */

type Phase =
  | { kind: 'idle' }
  | { kind: 'unavailable' }
  | { kind: 'uploading' }
  | { kind: 'ok'; assertionId: string; contentHash: string }
  | { kind: 'error'; message: string };

// AssertionType mirrors BordereauOracle.AssertionType on-chain. Kept narrow so
// the UI doesn't accidentally submit an unknown int that the contract rejects.
const ASSERTION_TYPES: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Premium bordereau' },
  { value: 1, label: 'Loss bordereau' },
  { value: 2, label: 'Aggregate exposure' },
];

export function BordereauUploadPanel() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [portfolioId, setPortfolioId] = useState('');
  const [assertionType, setAssertionType] = useState<number>(0);
  const [declaredAmount, setDeclaredAmount] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/bordereau/status');
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

  async function submit() {
    setPhase({ kind: 'idle' });
    if (!isConnected || !address) {
      setPhase({ kind: 'error', message: 'Connect your wallet.' });
      return;
    }
    if (available === false) {
      setPhase({ kind: 'unavailable' });
      return;
    }
    if (!file) {
      setPhase({ kind: 'error', message: 'Pick a bordereau file.' });
      return;
    }
    if (!/^\d+$/.test(portfolioId)) {
      setPhase({ kind: 'error', message: 'Portfolio ID must be a positive integer.' });
      return;
    }
    const amountInt = (() => {
      const f = Number(declaredAmount);
      if (!Number.isFinite(f) || f <= 0) return null;
      return BigInt(Math.round(f * 1_000_000));
    })();
    if (amountInt === null) {
      setPhase({ kind: 'error', message: 'Declared amount must be a positive number (USDC).' });
      return;
    }

    setPhase({ kind: 'uploading' });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const contentHash = keccak256Hex(bytes);
      const ts = Math.floor(Date.now() / 1000);
      const action = `bordereau:upload:${portfolioId}:${contentHash}`;
      const signature = await signMessageAsync({ message: operatorAuthMessage(action, ts) });

      const fd = new FormData();
      fd.append('file', file);
      fd.append('portfolioId', portfolioId);
      fd.append('assertionType', String(assertionType));
      fd.append('declaredAmount', String(amountInt));
      fd.append('address', address);
      fd.append('timestamp', String(ts));
      fd.append('signature', signature);

      const res = await fetch('/api/bordereau/upload', { method: 'POST', body: fd });
      if (res.status === 503) {
        setPhase({ kind: 'unavailable' });
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setPhase({ kind: 'error', message: j.error ?? `HTTP ${res.status}` });
        return;
      }
      const j = (await res.json()) as { assertionId: string; contentHash: string };
      setPhase({ kind: 'ok', assertionId: j.assertionId, contentHash: j.contentHash });
      setFile(null);
      setDeclaredAmount('');
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message.slice(0, 200) : 'upload failed' });
    }
  }

  if (available === false) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Bordereau upload</h2>
        <p className="text-[11px] text-gray-400">Bordereau backend not configured on this deployment.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Bordereau upload</h2>
      <p className="mb-3 text-xs text-gray-500">
        Upload the bordereau file. The file is stored in private Storage; only its{' '}
        <code>keccak256</code> hash is committed on-chain by the Sentinel via{' '}
        <code>BordereauOracle.proposeAssertion</code>.
      </p>

      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <label className="block">
          <span className="text-gray-600">Portfolio ID</span>
          <input
            value={portfolioId}
            onChange={(e) => setPortfolioId(e.target.value)}
            placeholder="e.g. 42"
            className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1"
          />
        </label>
        <label className="block">
          <span className="text-gray-600">Assertion type</span>
          <select
            value={assertionType}
            onChange={(e) => setAssertionType(Number(e.target.value))}
            className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1"
          >
            {ASSERTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-gray-600">Declared amount (USDC)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={declaredAmount}
            onChange={(e) => setDeclaredAmount(e.target.value)}
            placeholder="125000.00"
            className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-gray-600">Bordereau file (≤ 25 MB)</span>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-0.5 w-full text-[11px] text-gray-700"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={phase.kind === 'uploading' || !isConnected}
          className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {phase.kind === 'uploading' ? 'Signing & uploading…' : 'Sign & upload'}
        </button>
        {phase.kind === 'ok' && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">
            Uploaded ✓ — assertion {phase.assertionId.slice(0, 8)}…
          </span>
        )}
      </div>

      {phase.kind === 'error' && <p className="mt-2 text-xs text-red-700">{phase.message}</p>}
      {phase.kind === 'ok' && (
        <p className="mt-2 break-all text-[10px] text-gray-400">contentHash: {phase.contentHash}</p>
      )}
    </section>
  );
}
