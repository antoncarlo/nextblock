'use client';

import { useCallback, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { encodeFunctionData } from 'viem';
import { NEXTBLOCK_ADDRESSES } from '@/config/generated/addressBook';
import {
  operatorAuthMessage,
  isValidTransition,
  KYB_STATUSES,
  type KybStatus,
} from '@/lib/kyb/schema';
import { DataSourceBadge } from '@/components/shared/DataSourceBadge';

/**
 * KYB review queue for the KYC Operator.
 *
 * Authorization model: every API call is authenticated by signing a message
 * with the connected wallet; the SERVER verifies the signature and the
 * on-chain KYC_OPERATOR_ROLE / OWNER_ROLE membership. The client-side admin
 * gate is cosmetic; this signature+role check is the real one.
 *
 * DB approval is instructional only. For approved applications this panel
 * shows the FUTURE whitelist calldata to propose via the Safe flow — it never
 * sends transactions.
 */

interface KybAppRow {
  id: string;
  applicant_type: 'cedant' | 'curator';
  wallet_address: string;
  company_name: string;
  legal_entity_type: string;
  jurisdiction: string;
  license_number: string | null;
  declared_portfolio: string | null;
  contact_name: string;
  contact_email: string;
  website: string | null;
  description: string | null;
  status: KybStatus;
  created_at: string;
  updated_at: string;
}

interface KybEventRow {
  id: string;
  application_id: string;
  actor_address: string;
  from_status: KybStatus;
  to_status: KybStatus;
  note: string | null;
  created_at: string;
}

type QueueState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'denied'; error: string }
  | { kind: 'ready'; apps: KybAppRow[]; events: KybEventRow[] };

const SET_WHITELIST_ABI = [
  {
    type: 'function',
    name: 'setWhitelist',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'allowed', type: 'bool' },
    ],
    outputs: [],
  },
] as const;

const STATUS_COLORS: Record<KybStatus, { bg: string; color: string }> = {
  submitted: { bg: '#EFF6FF', color: '#1D4ED8' },
  under_review: { bg: '#FFF7ED', color: '#C2410C' },
  approved: { bg: '#F0FDF4', color: '#166534' },
  rejected: { bg: '#FEF2F2', color: '#B91C1C' },
  needs_info: { bg: '#FAF5FF', color: '#7E22CE' },
};

export function KybReviewQueue() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [queue, setQueue] = useState<QueueState>({ kind: 'idle' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Reuse the list signature while it is still comfortably inside the server
  // auth window, so a review action does not force a second list signature.
  const [listAuth, setListAuth] = useState<{ timestamp: number; signature: string } | null>(null);

  const fetchList = useCallback(
    async (auth: { timestamp: number; signature: string }) => {
      const res = await fetch('/api/kyb/applications', {
        headers: {
          'x-kyb-address': address ?? '',
          'x-kyb-timestamp': String(auth.timestamp),
          'x-kyb-signature': auth.signature,
        },
      });
      if (res.status === 503) {
        setQueue({ kind: 'unavailable' });
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQueue({ kind: 'denied', error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}` });
        return;
      }
      setQueue({ kind: 'ready', apps: data.applications ?? [], events: data.events ?? [] });
    },
    [address],
  );

  const loadQueue = useCallback(async () => {
    if (!address) return;
    setQueue({ kind: 'loading' });
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await signMessageAsync({ message: operatorAuthMessage('list', timestamp) });
      setListAuth({ timestamp, signature });
      await fetchList({ timestamp, signature });
    } catch {
      setQueue({ kind: 'idle' });
    }
  }, [address, signMessageAsync, fetchList]);

  const refreshList = useCallback(async () => {
    const now = Math.floor(Date.now() / 1000);
    if (listAuth && now - listAuth.timestamp < 240) {
      await fetchList(listAuth);
    } else {
      await loadQueue();
    }
  }, [listAuth, fetchList, loadQueue]);

  const review = useCallback(
    async (id: string, toStatus: KybStatus) => {
      if (!address) return;
      setActionPending(true);
      setActionError(null);
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = await signMessageAsync({
          message: operatorAuthMessage(`review:${id}:${toStatus}`, timestamp),
        });
        const res = await fetch(`/api/kyb/applications/${id}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toStatus, note, auth: { address, timestamp, signature } }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setActionError(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`);
        } else {
          setNote('');
          await refreshList();
        }
      } catch {
        setActionError('Signature rejected or network error.');
      } finally {
        setActionPending(false);
      }
    },
    [address, note, signMessageAsync, refreshList],
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">KYB Review Queue (KYC Operator)</h3>
        <DataSourceBadge source={queue.kind === 'ready' ? 'backend' : queue.kind === 'unavailable' ? 'unavailable' : 'backend'} />
      </div>
      <p className="mb-4 text-xs text-gray-500">
        Instructional review pipeline. Access requires a wallet signature verified
        server-side against the on-chain KYC Operator / Owner role. Approval here
        never writes the on-chain whitelist.
      </p>

      {!isConnected && <p className="text-xs text-gray-400">Connect a wallet to load the queue.</p>}

      {isConnected && queue.kind !== 'ready' && (
        <button
          type="button"
          onClick={loadQueue}
          disabled={queue.kind === 'loading'}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
        >
          {queue.kind === 'loading' ? 'Sign & loading...' : 'Sign to load applications'}
        </button>
      )}

      {queue.kind === 'unavailable' && (
        <p className="mt-3 text-xs text-red-700">
          KYB backend unavailable (server not configured or unreachable). No data is shown by design.
        </p>
      )}
      {queue.kind === 'denied' && (
        <p className="mt-3 text-xs text-red-700">Access denied: {queue.error}</p>
      )}

      {queue.kind === 'ready' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">{queue.apps.length} application(s)</p>
            <button type="button" onClick={refreshList} className="text-xs font-medium text-blue-700 hover:text-blue-900">
              Refresh
            </button>
          </div>
          {queue.apps.length === 0 && (
            <p className="text-xs text-gray-400">No applications on record.</p>
          )}
          {queue.apps.map(app => {
            const sc = STATUS_COLORS[app.status];
            const appEvents = queue.events.filter(e => e.application_id === app.id);
            const expanded = expandedId === app.id;
            const nextStatuses = KYB_STATUSES.filter(s => isValidTransition(app.status, s));
            return (
              <div key={app.id} className="rounded-lg border border-gray-100">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : app.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div>
                    <span className="text-sm font-semibold text-gray-900">{app.company_name}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {app.applicant_type} · <code>{app.wallet_address.slice(0, 6)}...{app.wallet_address.slice(-4)}</code>
                    </span>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ background: sc.bg, color: sc.color }}
                  >
                    {app.status.replace('_', ' ')}
                  </span>
                </button>

                {expanded && (
                  <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-600">
                    <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1">
                      <span>Entity type: {app.legal_entity_type}</span>
                      <span>Jurisdiction: {app.jurisdiction}</span>
                      <span>License: {app.license_number ?? 'n/a'}</span>
                      <span>Declared figure: {app.declared_portfolio ?? 'n/a'}</span>
                      <span>Contact: {app.contact_name} ({app.contact_email})</span>
                      <span>Website: {app.website ?? 'n/a'}</span>
                      <span className="col-span-2">Wallet: <code>{app.wallet_address}</code></span>
                      {app.description && <span className="col-span-2">Notes: {app.description}</span>}
                    </div>

                    {appEvents.length > 0 && (
                      <div className="mb-3">
                        <p className="mb-1 font-semibold text-gray-700">Audit trail</p>
                        {appEvents.map(e => (
                          <p key={e.id} className="text-gray-500">
                            {new Date(e.created_at).toLocaleString()} — {e.from_status} → {e.to_status} by{' '}
                            <code>{e.actor_address.slice(0, 6)}...{e.actor_address.slice(-4)}</code>
                            {e.note ? ` — "${e.note}"` : ''}
                          </p>
                        ))}
                      </div>
                    )}

                    {nextStatuses.length > 0 && (
                      <div className="mb-3">
                        <input
                          type="text"
                          value={note}
                          onChange={e => setNote(e.target.value)}
                          placeholder="Review note (recorded in the audit trail)"
                          className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
                        />
                        <div className="flex flex-wrap gap-2">
                          {nextStatuses.map(s => (
                            <button
                              key={s}
                              type="button"
                              disabled={actionPending}
                              onClick={() => review(app.id, s)}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50"
                            >
                              {actionPending ? '...' : `Mark ${s.replace('_', ' ')}`}
                            </button>
                          ))}
                        </div>
                        {actionError && <p className="mt-2 text-red-700">{actionError}</p>}
                      </div>
                    )}

                    {app.status === 'approved' && (
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="mb-1 font-semibold text-gray-700">
                          Next step (separate authorized act — NOT sent by this UI)
                        </p>
                        <p className="mb-2 text-gray-500">
                          Propose via the protocol Safe as KYC Operator on ComplianceRegistry:
                        </p>
                        <p className="font-mono break-all text-gray-700">
                          target: {NEXTBLOCK_ADDRESSES.complianceRegistry}
                        </p>
                        <p className="font-mono break-all text-gray-700">
                          calldata (setWhitelist):{' '}
                          {encodeFunctionData({
                            abi: SET_WHITELIST_ABI,
                            functionName: 'setWhitelist',
                            args: [app.wallet_address as `0x${string}`, true],
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
