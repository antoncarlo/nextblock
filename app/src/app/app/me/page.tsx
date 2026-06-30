'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { operatorAuthMessage } from '@/lib/kyb/schema';

/**
 * Per-address user preferences page.
 *
 * Today: notification preferences (in-app on by default, email off until
 * explicit opt-in). The page is wallet-scoped — read and write are bound to
 * the connected wallet via signed-action auth (notifications:prefs:*).
 *
 * Designed as a single landing point for "my account" controls that don't
 * have a dedicated dashboard (LP doesn't need a full dashboard since
 * /app/vault/* already covers their flows).
 */

interface PrefsRow {
  address: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  email: string | null;
  updated_at: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'loading' }
  | { kind: 'ready'; prefs: PrefsRow }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

export default function MePage() {
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
      signature = await signMessageAsync({
        message: operatorAuthMessage(`notifications:prefs:read:${address.toLowerCase()}`, ts),
      });
    } catch {
      setPhase({ kind: 'error', message: 'Signature declined.' });
      return;
    }
    setPhase({ kind: 'loading' });
    try {
      const qs = new URLSearchParams({ address, timestamp: String(ts), signature });
      const res = await fetch(`/api/notifications/prefs?${qs}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setPhase({ kind: 'error', message: j.error ?? `HTTP ${res.status}` });
        return;
      }
      const j = (await res.json()) as { prefs: PrefsRow };
      setPhase({ kind: 'ready', prefs: j.prefs });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'fetch failed' });
    }
  }, [address, isConnected, signMessageAsync]);

  const save = useCallback(
    async (patch: { inAppEnabled?: boolean; emailEnabled?: boolean; email?: string | null }) => {
      if (phase.kind !== 'ready' || !address) return;
      setPhase({ kind: 'saving' });
      const ts = Math.floor(Date.now() / 1000);
      let signature: `0x${string}`;
      try {
        signature = await signMessageAsync({
          message: operatorAuthMessage(`notifications:prefs:write:${address.toLowerCase()}`, ts),
        });
      } catch {
        setPhase({ kind: 'error', message: 'Signature declined.' });
        return;
      }
      try {
        const res = await fetch('/api/notifications/prefs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            auth: { address, timestamp: ts, signature },
            ...patch,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setPhase({ kind: 'error', message: j.error ?? `HTTP ${res.status}` });
          return;
        }
        // Refetch to get the latest persisted state.
        await load();
      } catch (e) {
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'save failed' });
      }
    },
    [address, load, phase, signMessageAsync],
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">My preferences</h1>
      <p className="mt-1 text-sm text-gray-500">
        Notification channels for the connected wallet. In-app is on by default; email is off until you
        explicitly opt in. Email channel is best-effort — the in-app notification is the source of truth.
      </p>

      {phase.kind === 'idle' || phase.kind === 'error' ? (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => void load()}
            disabled={!isConnected}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isConnected ? 'Sign & load' : 'Connect wallet to load'}
          </button>
          {phase.kind === 'error' && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {phase.message}
            </p>
          )}
        </div>
      ) : phase.kind === 'signing' ? (
        <p className="mt-6 text-sm text-gray-600">Signing…</p>
      ) : phase.kind === 'loading' || phase.kind === 'saving' ? (
        <p className="mt-6 text-sm text-gray-600">{phase.kind === 'saving' ? 'Saving…' : 'Loading…'}</p>
      ) : (
        <PrefsForm prefs={phase.prefs} onSave={save} />
      )}
    </div>
  );
}

function PrefsForm({
  prefs,
  onSave,
}: {
  prefs: PrefsRow;
  onSave: (patch: { inAppEnabled?: boolean; emailEnabled?: boolean; email?: string | null }) => Promise<void>;
}) {
  const [email, setEmail] = useState(prefs.email ?? '');

  return (
    <div className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <Toggle
        label="In-app notifications"
        description="The bell icon in the header surfaces claim status changes and evidence uploads."
        checked={prefs.in_app_enabled}
        onChange={(v) => void onSave({ inAppEnabled: v })}
      />
      <Toggle
        label="Email notifications"
        description="Best-effort email mirror of in-app notifications. Privacy-by-default: opt-in required."
        checked={prefs.email_enabled}
        onChange={async (v) => {
          if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            alert('Enter a valid email address first.');
            return;
          }
          await onSave({ emailEnabled: v, email: v ? email : prefs.email });
        }}
      />
      <label className="block text-xs">
        <span className="text-gray-600">Email address</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ops@yourcompany.com"
          disabled={!prefs.email_enabled}
          className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <span className="mt-0.5 block text-[10px] text-gray-400">
          Used only for notification delivery. Change requires re-signing.
        </span>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void onSave({ email })}
          disabled={!prefs.email_enabled || email === (prefs.email ?? '')}
          className="rounded-md bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          Update email address
        </button>
      </div>
      <p className="text-[10px] text-gray-400">Last updated: {new Date(prefs.updated_at).toLocaleString()}</p>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void | Promise<void>;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => void onChange(!checked)}
        className={`mt-0.5 inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-violet-600' : 'bg-gray-300'
        }`}
        aria-pressed={checked}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
