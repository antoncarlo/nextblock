'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { operatorAuthMessage } from '@/lib/kyb/schema';
import { keccak256Hex, hashesMatch } from '@/lib/evidence/hash';

interface EvidenceRow {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  content_hash: string;
  uploader_addr: string;
  created_at: string;
}

interface SignedAuth {
  address: string;
  timestamp: number;
  signature: string;
}

/**
 * Claim evidence: upload (claimant) + list/download (reviewers or claimant), with
 * a hash-match badge vs the on-chain `evidenceHash`. All access is server-mediated
 * and on-chain-gated; this panel just signs the action and surfaces results. The
 * private documents are never exposed except via short-lived signed URLs.
 */
export function EvidencePanel({ claimId, evidenceHash }: { claimId: bigint; evidenceHash: `0x${string}` }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [rows, setRows] = useState<EvidenceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/claims/evidence/status');
        const j = await r.json();
        if (!cancelled) setAvailable(!!j.available);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function sign(action: string): Promise<SignedAuth | null> {
    if (!address) return null;
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await signMessageAsync({ message: operatorAuthMessage(action, timestamp) });
    return { address, timestamp, signature };
  }

  async function loadList() {
    setError(null);
    setBusy(true);
    try {
      const a = await sign(`evidence:list:${claimId}`);
      if (!a) {
        setError('Connect your wallet.');
        return;
      }
      const qs = new URLSearchParams({ address: a.address, timestamp: String(a.timestamp), signature: a.signature });
      const r = await fetch(`/api/claims/evidence/${claimId}?${qs.toString()}`);
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? 'Failed to load evidence.');
        return;
      }
      setRows(j.evidence ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 120) : 'error');
    } finally {
      setBusy(false);
    }
  }

  async function download(id: string) {
    setError(null);
    setBusy(true);
    try {
      const a = await sign(`evidence:download:${id}`);
      if (!a) return;
      const r = await fetch('/api/claims/evidence/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId: id, ...a }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? 'Download failed.');
        return;
      }
      window.open(j.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 120) : 'error');
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const hash = keccak256Hex(bytes);
      const a = await sign(`evidence:upload:${claimId}:${hash}`);
      if (!a) {
        setError('Connect your wallet.');
        return;
      }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('claimId', String(claimId));
      fd.append('address', a.address);
      fd.append('timestamp', String(a.timestamp));
      fd.append('signature', a.signature);
      const r = await fetch('/api/claims/evidence/upload', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? 'Upload failed.');
        return;
      }
      setFile(null);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 120) : 'error');
    } finally {
      setBusy(false);
    }
  }

  if (available === false) {
    return <p className="text-[11px] text-gray-400">Evidence backend not configured on this deployment.</p>;
  }

  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <p className="mb-1 text-xs font-medium text-gray-700">Evidence</p>
      <p className="mb-2 break-all text-[11px] text-gray-400">on-chain hash: {evidenceHash}</p>

      {!isConnected ? (
        <p className="text-xs text-gray-500">Connect your wallet to view or upload evidence.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadList}
              disabled={busy}
              className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-200 disabled:opacity-50"
            >
              {busy ? 'Signing…' : 'View evidence'}
            </button>
          </div>

          {rows && rows.length === 0 && <p className="text-xs text-gray-400">No evidence uploaded yet.</p>}
          {rows && rows.length > 0 && (
            <ul className="space-y-1">
              {rows.map((row) => {
                const match = hashesMatch(row.content_hash, evidenceHash);
                return (
                  <li key={row.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-gray-700">{row.file_name}</span>
                    <span className="flex flex-shrink-0 items-center gap-2">
                      <span className={match ? 'text-emerald-600' : 'text-red-600'}>
                        {match ? 'hash ✓' : 'hash ✗'}
                      </span>
                      <button
                        type="button"
                        onClick={() => download(row.id)}
                        disabled={busy}
                        className="rounded bg-gray-900 px-2 py-0.5 text-white hover:bg-gray-800 disabled:opacity-50"
                      >
                        Download
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Upload (server enforces claimant-only) */}
          <div className="flex items-center gap-2 border-t border-gray-100 pt-2">
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-[11px] text-gray-600"
            />
            <button
              type="button"
              onClick={upload}
              disabled={busy || !file}
              className="rounded-md bg-violet-600 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              Upload
            </button>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
