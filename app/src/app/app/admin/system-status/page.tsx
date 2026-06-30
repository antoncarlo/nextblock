'use client';

import { useCallback, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { operatorAuthMessage } from '@/lib/kyb/schema';

/**
 * Admin system status — what's mock, what's real, what's reachable.
 *
 * Reviewer-auth (Sentinel/Committee/Owner). Renders four sections:
 *   - Providers: per-surface mode + key readiness
 *   - Platform env vars: present / missing (no values)
 *   - RPC + Supabase health
 *   - Deploy info (commit, environment, region)
 *
 * Never displays the actual value of any secret — only present/missing
 * flags. Safe to leave open in a browser tab during operations.
 */

interface ProviderConfig {
  surface: string;
  selected: string;
  isMock: boolean;
  keysReady: boolean;
  requiredVars: Array<{ name: string; present: boolean }>;
}

interface StatusPayload {
  providers: ProviderConfig[];
  platformEnv: Array<{ name: string; present: boolean; required: boolean }>;
  rpc: { url: string; chainId: number; latestBlock: string | null; latencyMs: number; error: string | null };
  supabase: { ok: boolean; error: string | null };
  deploy: { commitSha: string | null; deploymentId: string | null; environment: string; region: string | null };
  nowIso: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'loading' }
  | { kind: 'ready'; payload: StatusPayload }
  | { kind: 'error'; message: string };

export default function SystemStatusPage() {
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
      signature = await signMessageAsync({ message: operatorAuthMessage('admin:system-status', ts) });
    } catch {
      setPhase({ kind: 'error', message: 'Signature declined.' });
      return;
    }
    setPhase({ kind: 'loading' });
    try {
      const qs = new URLSearchParams({ address, timestamp: String(ts), signature });
      const res = await fetch(`/api/admin/system-status?${qs}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setPhase({ kind: 'error', message: j.error ?? `HTTP ${res.status}` });
        return;
      }
      const j = (await res.json()) as StatusPayload;
      setPhase({ kind: 'ready', payload: j });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'fetch failed' });
    }
  }, [address, isConnected, signMessageAsync]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">System status</h1>
      <p className="mt-1 text-sm text-gray-500">
        Live snapshot of pluggable providers, platform env vars, RPC and Supabase health, and the current
        Vercel deploy. Never displays secret values — only present/missing flags.
      </p>

      <div className="mt-4 flex items-center gap-2">
        {phase.kind === 'idle' || phase.kind === 'error' ? (
          <button
            type="button"
            onClick={() => void load()}
            disabled={!isConnected}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isConnected ? 'Sign & probe' : 'Connect wallet to probe'}
          </button>
        ) : phase.kind === 'signing' ? (
          <p className="text-sm text-gray-600">Signing…</p>
        ) : phase.kind === 'loading' ? (
          <p className="text-sm text-gray-600">Probing…</p>
        ) : (
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        )}
      </div>

      {phase.kind === 'error' && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{phase.message}</div>
      )}

      {phase.kind === 'ready' && <StatusBody payload={phase.payload} />}
    </div>
  );
}

function StatusBody({ payload }: { payload: StatusPayload }) {
  return (
    <div className="mt-6 space-y-4">
      <Section title="Providers">
        <table className="w-full text-xs">
          <thead className="text-gray-500">
            <tr>
              <th className="py-1 pr-3 text-left">Surface</th>
              <th className="py-1 pr-3 text-left">Selected</th>
              <th className="py-1 pr-3 text-left">Mode</th>
              <th className="py-1 pr-3 text-left">Keys</th>
              <th className="py-1 text-left">Required vars</th>
            </tr>
          </thead>
          <tbody>
            {payload.providers.map((p) => (
              <tr key={p.surface} className="border-t border-gray-100">
                <td className="py-1.5 pr-3 font-medium text-gray-800">{p.surface}</td>
                <td className="py-1.5 pr-3 text-gray-700">{p.selected}</td>
                <td className="py-1.5 pr-3">
                  <Badge tone={p.isMock ? 'warn' : 'ok'} label={p.isMock ? 'mock' : 'live'} />
                </td>
                <td className="py-1.5 pr-3">
                  <Badge tone={p.keysReady ? 'ok' : 'bad'} label={p.keysReady ? 'ready' : 'missing'} />
                </td>
                <td className="py-1.5 text-[11px] text-gray-600">
                  {p.requiredVars.length === 0 ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    p.requiredVars.map((v) => (
                      <span key={v.name} className="mr-2">
                        <code>{v.name}</code>{' '}
                        <Badge tone={v.present ? 'ok' : 'bad'} label={v.present ? 'set' : 'missing'} />
                      </span>
                    ))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Platform env">
        <ul className="space-y-1 text-xs">
          {payload.platformEnv.map((v) => (
            <li key={v.name} className="flex items-center justify-between gap-2">
              <code className="text-gray-700">{v.name}</code>
              <span className="flex items-center gap-2">
                {v.required && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">required</span>}
                <Badge tone={v.present ? 'ok' : v.required ? 'bad' : 'warn'} label={v.present ? 'set' : 'missing'} />
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="RPC + Supabase">
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <Card label="RPC latest block">
            {payload.rpc.error ? (
              <span className="text-red-700">{payload.rpc.error}</span>
            ) : (
              <>
                <div className="font-medium text-gray-900">
                  {payload.rpc.latestBlock ?? '—'}
                </div>
                <div className="text-[11px] text-gray-500">
                  chain {payload.rpc.chainId} · latency {payload.rpc.latencyMs} ms
                </div>
                <div className="mt-1 break-all text-[10px] text-gray-400">{payload.rpc.url}</div>
              </>
            )}
          </Card>
          <Card label="Supabase service-role">
            <Badge tone={payload.supabase.ok ? 'ok' : 'bad'} label={payload.supabase.ok ? 'reachable' : 'unreachable'} />
            {payload.supabase.error && (
              <div className="mt-1 text-[11px] text-red-700">{payload.supabase.error}</div>
            )}
          </Card>
        </div>
      </Section>

      <Section title="Deploy">
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <Card label="Environment">
            <div className="font-medium">{payload.deploy.environment}</div>
          </Card>
          <Card label="Region">
            <div className="font-medium">{payload.deploy.region ?? '—'}</div>
          </Card>
          <Card label="Commit">
            <code className="text-[11px]">{payload.deploy.commitSha ?? '—'}</code>
          </Card>
          <Card label="Deployment ID">
            <code className="break-all text-[10px]">{payload.deploy.deploymentId ?? '—'}</code>
          </Card>
        </div>
      </Section>

      <p className="text-[10px] text-gray-400">Probed at {new Date(payload.nowIso).toLocaleString()}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
      {children}
    </section>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50/40 p-3">
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Badge({ tone, label }: { tone: 'ok' | 'warn' | 'bad'; label: string }) {
  const cls =
    tone === 'ok'
      ? 'bg-emerald-100 text-emerald-800'
      : tone === 'warn'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-800';
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}
