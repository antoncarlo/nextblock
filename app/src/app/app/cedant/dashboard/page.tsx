'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useVaultInfo } from '@/hooks/useVaultData';
import { formatUSDC } from '@/lib/formatting';
import { PremiumPaymentPanel } from '@/components/cedant/PremiumPaymentPanel';
import { BordereauUploadPanel } from '@/components/cedant/BordereauUploadPanel';

/**
 * Cedant dashboard — the single landing page for an approved cedant.
 *
 * Sections (rendered conditionally based on application + vault state):
 *   - Identity card        company name, jurisdiction, application status, sanctions
 *   - Vault summary        primary vault address + on-chain NAV / supply / buffer
 *   - Quick actions        Register policy · Pay premium · Submit claim
 *   - Recent activity      last 5 audit-trail events tied to the cedant's vault
 *   - Profile              underwriting metadata snapshot
 *
 * Read-only by design — actions deep-link into the existing vault management
 * page so we don't duplicate the on-chain transaction building.
 */

interface DashboardPayload {
  application: {
    id: string;
    status: string;
    companyName: string;
    jurisdiction: string;
    contactName: string;
    contactEmail: string;
    createdAt: string;
  };
  profile: {
    policy_types: string[];
    geo_scope: string[];
    annual_premium_band: string | null;
    expected_ceded_capacity_usdc: number | null;
    primary_vault_address: string | null;
    vault_provisioned_at: string | null;
    vault_provisioned_by: string | null;
    notes: string | null;
  } | null;
  sanctions: { result_code: 'clear' | 'match' | 'error'; match_count: number; ts: string } | null;
  auditFeed: Array<{
    id: string;
    event_name: string;
    block_number: number;
    tx_hash: string;
    ts: string;
  }>;
  vaultProvisioned: boolean;
}

export default function CedantDashboardPage() {
  const { address, isConnected } = useAccount();
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cedant/by-wallet?wallet=${address}`);
        if (cancelled) return;
        if (res.status === 404) {
          setError('No cedant application found for this wallet.');
          return;
        }
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return;
        }
        const j = (await res.json()) as DashboardPayload;
        setPayload(j);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'fetch failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  const vaultAddress =
    (payload?.profile?.primary_vault_address as `0x${string}` | undefined) ?? undefined;
  const { data: vaultInfo } = useVaultInfo(vaultAddress);

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-sm text-gray-500">Connect your cedant wallet to view the dashboard.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {error}{' '}
          <Link href="/app/cedant/onboard" className="font-medium underline">
            Start onboarding →
          </Link>
        </div>
      </div>
    );
  }
  if (!payload) {
    return <p className="mx-auto max-w-4xl px-4 py-8 text-sm text-gray-500">Loading…</p>;
  }

  const a = payload.application;
  const p = payload.profile;

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Cedant dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          {a.companyName} · {a.jurisdiction}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="Status">
          <StatusRow label="KYB" value={a.status} severity={a.status === 'approved' ? 'ok' : 'warn'} />
          <StatusRow
            label="Sanctions"
            value={payload.sanctions?.result_code ?? 'not run'}
            severity={
              payload.sanctions?.result_code === 'clear'
                ? 'ok'
                : payload.sanctions?.result_code === 'match'
                  ? 'bad'
                  : 'warn'
            }
          />
          <StatusRow
            label="Vault"
            value={payload.vaultProvisioned ? 'provisioned' : 'pending'}
            severity={payload.vaultProvisioned ? 'ok' : 'warn'}
          />
        </Card>

        <Card title="Vault">
          {vaultAddress ? (
            <>
              <div className="break-all text-[11px] text-gray-600">{vaultAddress}</div>
              {vaultInfo ? (
                <>
                  {/* getVaultInfo tuple: [name, manager, assets, shares, sharePrice, bufferBps, feeBps, …]. */}
                  <Metric label="Total assets" value={`${formatUSDC(vaultInfo[2])} USDC`} />
                  <Metric label="Total supply" value={String(vaultInfo[3])} />
                  <Metric label="Buffer ratio" value={`${Number(vaultInfo[5]) / 100}%`} />
                </>
              ) : (
                <p className="mt-1 text-xs text-gray-400">Reading on-chain…</p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-500">
              Vault not yet provisioned. Once the Curator deploys it, the address appears here.
            </p>
          )}
        </Card>

        <Card title="Quick actions">
          {vaultAddress ? (
            <ul className="space-y-1.5 text-xs">
              <li>
                <Link
                  href={`/app/vault/${vaultAddress}/manage`}
                  className="text-violet-700 hover:underline"
                >
                  Manage vault →
                </Link>
              </li>
              <li>
                <Link
                  href={`/app/vault/${vaultAddress}`}
                  className="text-violet-700 hover:underline"
                >
                  View vault page →
                </Link>
              </li>
              <li>
                <Link href="/app/claims" className="text-violet-700 hover:underline">
                  Claims control room →
                </Link>
              </li>
            </ul>
          ) : (
            <p className="text-xs text-gray-500">
              <Link href="/app/cedant/onboard" className="font-medium text-violet-700 underline">
                Complete onboarding →
              </Link>
            </p>
          )}
        </Card>
      </div>

      {vaultAddress && <PremiumPaymentPanel vaultAddress={vaultAddress} />}
      {vaultAddress && <BordereauUploadPanel />}

      <Card title="Recent activity">
        {payload.auditFeed.length === 0 ? (
          <p className="text-xs text-gray-500">No recorded activity yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {payload.auditFeed.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-gray-900">{r.event_name}</span>
                <a
                  href={`https://sepolia.basescan.org/tx/${r.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-700 hover:underline"
                >
                  block {r.block_number} · {new Date(r.ts).toLocaleString()} ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {p && (
        <Card title="Underwriting profile">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Metric label="Lines of business" value={p.policy_types.join(', ') || '—'} />
            <Metric label="Geo scope" value={p.geo_scope.join(', ') || '—'} />
            <Metric label="Annual premium band" value={p.annual_premium_band ?? '—'} />
            <Metric
              label="Expected capacity"
              value={
                p.expected_ceded_capacity_usdc
                  ? `${(p.expected_ceded_capacity_usdc / 1_000_000).toLocaleString()} USDC`
                  : '—'
              }
            />
          </div>
          {p.notes && <p className="mt-2 text-[11px] text-gray-500">Notes: {p.notes}</p>}
        </Card>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
      {children}
    </section>
  );
}

function StatusRow({
  label,
  value,
  severity,
}: {
  label: string;
  value: string;
  severity: 'ok' | 'warn' | 'bad';
}) {
  const color = severity === 'ok' ? 'text-emerald-700' : severity === 'bad' ? 'text-red-700' : 'text-amber-700';
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div data-track-section="cedant_dashboard">
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}
