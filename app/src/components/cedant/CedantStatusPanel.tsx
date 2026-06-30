'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSignMessage } from 'wagmi';
import { operatorAuthMessage } from '@/lib/kyb/schema';

/**
 * Cedant onboarding status panel.
 *
 * Polls /api/cedant/[id] every 30s and renders the right step based on
 *   - application.status        (submitted → under_review → approved/rejected)
 *   - sanctions.result_code     (clear / match / null = not run yet)
 *   - profile.primary_vault_address  (null = vault not provisioned yet)
 *
 * Once approved + vault provisioned, the cedant lands on a CTA that links
 * to /app/vault/[address]/manage where they can register policies + premiums.
 *
 * The Curator's createVault flow is intentionally handled in the existing
 * /app/create-vault page (Curator-only); this panel just shows the cedant
 * the link to share with the Curator, and records the resulting vault
 * address via /api/cedant/[id]/provision-vault once the Curator pastes it.
 */

interface CedantState {
  application: {
    id: string;
    status: 'submitted' | 'under_review' | 'needs_info' | 'approved' | 'rejected';
    companyName: string;
    jurisdiction: string;
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
  readyForVault: boolean;
  vaultProvisioned: boolean;
}

export function CedantStatusPanel({
  applicationId,
  walletAddress,
}: {
  applicationId: string;
  walletAddress: `0x${string}`;
}) {
  const [state, setState] = useState<CedantState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { signMessageAsync } = useSignMessage();

  const refresh = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ wallet: walletAddress });
      const r = await fetch(`/api/cedant/${applicationId}?${qs}`);
      if (!r.ok) {
        setError(`HTTP ${r.status}`);
        return;
      }
      const j = (await r.json()) as CedantState;
      setState(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed');
    }
  }, [applicationId, walletAddress]);

  useEffect(() => {
    // eslint-disable-next-line
    void refresh();
    const t = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  if (error && !state) {
    return <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  }
  if (!state) {
    return <p className="mt-6 text-sm text-gray-500">Loading status…</p>;
  }

  const s = state.application.status;

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-xs uppercase tracking-wide text-gray-400">Application</div>
        <div className="mt-1 text-sm font-medium text-gray-900">{state.application.companyName}</div>
        <div className="text-xs text-gray-500">
          {state.application.jurisdiction} · ID {state.application.id.slice(0, 8)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={s} />
          {state.sanctions && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                state.sanctions.result_code === 'clear'
                  ? 'bg-emerald-100 text-emerald-800'
                  : state.sanctions.result_code === 'match'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-amber-100 text-amber-800'
              }`}
            >
              sanctions: {state.sanctions.result_code}
            </span>
          )}
        </div>
      </div>

      {/* Step 2: KYB + sanctions in progress */}
      {(s === 'submitted' || s === 'under_review' || s === 'needs_info') && (
        <Step
          n={2}
          title="Under review"
          body="The Curator is reviewing your application and the platform is screening it for sanctions / PEP / adverse-media. This page refreshes automatically."
        />
      )}

      {s === 'rejected' && (
        <Step n={2} title="Rejected" body="Your application was not approved. Contact the Curator for next steps.">
          <p className="text-xs text-red-700">No further action available here.</p>
        </Step>
      )}

      {/* Step 3: approved, waiting for vault provisioning */}
      {s === 'approved' && state.readyForVault && (
        <Step
          n={3}
          title="Ready for vault provisioning"
          body="Your application is approved. The Curator needs to deploy your dedicated vault. Share your application ID with the Curator and, once they sign the createVault transaction, paste the resulting vault address below to complete onboarding."
        >
          <VaultProvisioningRecorder
            applicationId={applicationId}
            walletAddress={walletAddress}
            onRecorded={() => void refresh()}
            signMessageAsync={signMessageAsync}
          />
        </Step>
      )}

      {/* Step 4: vault provisioned */}
      {s === 'approved' && state.vaultProvisioned && state.profile?.primary_vault_address && (
        <Step n={4} title="Onboarding complete" body="Your dedicated vault is live. You can now register policies and pay premiums.">
          <div className="space-y-2 text-xs">
            <div>
              Vault: <code className="text-violet-700">{state.profile.primary_vault_address}</code>
            </div>
            {state.profile.vault_provisioned_by && (
              <div className="text-gray-500">
                Provisioned by {state.profile.vault_provisioned_by.slice(0, 10)}… on{' '}
                {state.profile.vault_provisioned_at &&
                  new Date(state.profile.vault_provisioned_at).toLocaleString()}
              </div>
            )}
            <Link
              href={`/app/vault/${state.profile.primary_vault_address}/manage`}
              className="inline-block rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
              Go to vault management →
            </Link>
          </div>
        </Step>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'approved'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'rejected'
        ? 'bg-red-100 text-red-800'
        : status === 'needs_info'
          ? 'bg-amber-100 text-amber-800'
          : 'bg-blue-100 text-blue-800';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>{status}</span>;
}

function Step({
  n,
  title,
  body,
  children,
}: {
  n: number;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold text-gray-400">Step {n}</span>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <p className="mt-1 text-xs text-gray-600">{body}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function VaultProvisioningRecorder({
  applicationId,
  walletAddress,
  onRecorded,
  signMessageAsync,
}: {
  applicationId: string;
  walletAddress: `0x${string}`;
  onRecorded: () => void;
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>;
}) {
  const [vault, setVault] = useState('');
  const [txHash, setTxHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!/^0x[0-9a-fA-F]{40}$/.test(vault)) {
      setErr('Invalid vault address.');
      return;
    }
    setBusy(true);
    try {
      const ts = Math.floor(Date.now() / 1000);
      const action = `cedant:provision-vault:${applicationId}`;
      const signature = await signMessageAsync({ message: operatorAuthMessage(action, ts) });
      const res = await fetch(`/api/cedant/${applicationId}/provision-vault`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vaultAddress: vault.toLowerCase(),
          txHash: txHash || undefined,
          auth: { address: walletAddress, timestamp: ts, signature },
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? `HTTP ${res.status}`);
        return;
      }
      onRecorded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500">
        Action below is signed by a Curator (or Sentinel/Owner) wallet; it records the provisioned vault
        address. Cedants without a Curator role will see a 403 here.
      </p>
      <input
        value={vault}
        onChange={(e) => setVault(e.target.value)}
        placeholder="Vault address (0x…)"
        className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs"
      />
      <input
        value={txHash}
        onChange={(e) => setTxHash(e.target.value)}
        placeholder="createVault tx hash (optional)"
        className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs"
      />
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {busy ? 'Recording…' : 'Sign & record vault'}
      </button>
    </div>
  );
}
