'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';

/**
 * Lightweight hook used by the Header nav to decide whether to surface the
 * "Cedant" link. Caches the lookup per wallet in component state — every
 * Header mount re-fetches once. Returns `null` while loading, then the
 * application or `false` when no cedant application exists for the wallet.
 *
 * This is intentionally NOT a generic data hook; the dashboard fetches the
 * full payload from /api/cedant/by-wallet itself so it stays fresh.
 */

export type CedantPresence =
  | { state: 'loading' }
  | { state: 'absent' }
  | { state: 'present'; applicationId: string; status: string; vaultProvisioned: boolean };

export function useCedantStatus(): CedantPresence {
  const { address, isConnected } = useAccount();
  const [v, setV] = useState<CedantPresence>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (!isConnected || !address) {
      // eslint-disable-next-line
      setV({ state: 'absent' });
      return;
    }
    // eslint-disable-next-line
    setV({ state: 'loading' });
    (async () => {
      try {
        const res = await fetch(`/api/cedant/by-wallet?wallet=${address}`);
        if (cancelled) return;
        if (res.status === 404) {
          setV({ state: 'absent' });
          return;
        }
        if (!res.ok) {
          setV({ state: 'absent' });
          return;
        }
        const j = (await res.json()) as {
          application: { id: string; status: string };
          vaultProvisioned: boolean;
        };
        setV({
          state: 'present',
          applicationId: j.application.id,
          status: j.application.status,
          vaultProvisioned: j.vaultProvisioned,
        });
      } catch {
        if (!cancelled) setV({ state: 'absent' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  return v;
}
