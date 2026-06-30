'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { operatorAuthMessage } from '@/lib/kyb/schema';

/**
 * In-app notification bell.
 *
 * UX: the bell is a click-to-open dropdown. We don't auto-poll behind the
 * scenes because every read needs a wallet signature, and prompting the user
 * on every poll would be hostile. On click we ask for one signature, render
 * the list, and reuse the same signed credential (held only in memory) for
 * the "mark all read" action within the same panel open. Closing and
 * reopening prompts again.
 *
 * Backend status is checked at mount and again on open; when unavailable, the
 * panel renders a degraded message instead of inventing state.
 */

interface NotificationRow {
  id: string;
  claim_id: number;
  vault: string;
  kind: 'status_change' | 'evidence_uploaded';
  from_status: number | null;
  to_status: number | null;
  message: string;
  read_at: string | null;
  created_at: string;
}

type PanelState =
  | { phase: 'idle' }
  | { phase: 'unavailable' }
  | { phase: 'signing' }
  | { phase: 'loading' }
  | { phase: 'ready'; items: NotificationRow[]; unreadCount: number }
  | { phase: 'error'; message: string };

export function NotificationBell() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [state, setState] = useState<PanelState>({ phase: 'idle' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/notifications/status');
        const json = (await res.json()) as { available: boolean };
        if (!cancelled) setAvailable(json.available);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadList = useCallback(async () => {
    if (!isConnected || !address) {
      setState({ phase: 'error', message: 'Connect your wallet.' });
      return;
    }
    if (available === false) {
      setState({ phase: 'unavailable' });
      return;
    }
    setState({ phase: 'signing' });
    const timestamp = Math.floor(Date.now() / 1000);
    const action = `notifications:list:${address.toLowerCase()}`;
    let signature: `0x${string}`;
    try {
      signature = await signMessageAsync({ message: operatorAuthMessage(action, timestamp) });
    } catch {
      setState({ phase: 'error', message: 'Signature declined.' });
      return;
    }
    setState({ phase: 'loading' });
    try {
      const qs = new URLSearchParams({ address, timestamp: String(timestamp), signature, limit: '50' });
      const res = await fetch(`/api/notifications?${qs}`);
      if (res.status === 503) {
        setState({ phase: 'unavailable' });
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setState({ phase: 'error', message: j.error ?? `HTTP ${res.status}` });
        return;
      }
      const json = (await res.json()) as { notifications: NotificationRow[] };
      const items = json.notifications ?? [];
      const unreadCount = items.filter((n) => n.read_at === null).length;
      setState({ phase: 'ready', items, unreadCount });
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'fetch failed' });
    }
  }, [address, available, isConnected, signMessageAsync]);

  const markAllRead = useCallback(async () => {
    if (!isConnected || !address || state.phase !== 'ready') return;
    const timestamp = Math.floor(Date.now() / 1000);
    const action = `notifications:read:${address.toLowerCase()}`;
    let signature: `0x${string}`;
    try {
      signature = await signMessageAsync({ message: operatorAuthMessage(action, timestamp) });
    } catch {
      return;
    }
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          auth: { address, timestamp, signature },
          all: true,
        }),
      });
      if (res.ok) {
        setState({
          ...state,
          items: state.items.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
          unreadCount: 0,
        });
      }
    } catch {
      // swallow — non-fatal
    }
  }, [address, isConnected, signMessageAsync, state]);

  const handleToggle = () => {
    if (open) {
      setOpen(false);
      setState({ phase: 'idle' });
    } else {
      setOpen(true);
      void loadList();
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Notifications"
        title="Notifications"
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          border: '1px solid rgba(27,58,107,0.18)',
          background: open ? 'rgba(27,58,107,0.08)' : 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <span aria-hidden style={{ fontSize: 16 }}>🔔</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 40,
            right: 0,
            width: 340,
            maxHeight: 420,
            overflowY: 'auto',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            boxShadow: '0 10px 24px rgba(0,0,0,0.08)',
            zIndex: 50,
          }}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13, color: '#111827' }}>Notifications</strong>
            {state.phase === 'ready' && state.unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                style={{ fontSize: 12, color: '#1B3A6B', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div style={{ padding: 8 }}>
            {state.phase === 'signing' && <p style={{ fontSize: 12, color: '#6b7280', padding: 8 }}>Sign in your wallet to view notifications…</p>}
            {state.phase === 'loading' && <p style={{ fontSize: 12, color: '#6b7280', padding: 8 }}>Loading…</p>}
            {state.phase === 'unavailable' && <p style={{ fontSize: 12, color: '#6b7280', padding: 8 }}>Notification backend not configured yet.</p>}
            {state.phase === 'error' && <p style={{ fontSize: 12, color: '#b91c1c', padding: 8 }}>{state.message}</p>}
            {state.phase === 'ready' && state.items.length === 0 && (
              <p style={{ fontSize: 12, color: '#6b7280', padding: 8 }}>No notifications.</p>
            )}
            {state.phase === 'ready' &&
              state.items.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    background: n.read_at ? 'transparent' : 'rgba(27,58,107,0.04)',
                    marginBottom: 4,
                  }}
                >
                  <div style={{ fontSize: 12, color: '#111827' }}>{n.message}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
