'use client';

import { useEffect, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

/**
 * Ethereum mainnet client for ENS resolution.
 * Uses public RPC (no API key needed for occasional reads).
 */
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

const ensCache = new Map<string, string | null>();

/**
 * Resolve an Ethereum address to its ENS name.
 * Queries Ethereum mainnet regardless of the connected chain.
 */
export function useEnsName(address: `0x${string}` | undefined): {
  ensName: string | null;
  isLoading: boolean;
} {
  const [ensName, setEnsName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      // Defer to a microtask so no setState runs synchronously inside the
      // effect body (react-hooks/set-state-in-effect).
      queueMicrotask(() => setEnsName(null));
      return;
    }

    const cached = ensCache.get(address);
    if (cached !== undefined) {
      queueMicrotask(() => setEnsName(cached));
      return;
    }

    let cancelled = false;
    // Loading flag set in the same microtask pattern (no sync setState in effect).
    queueMicrotask(() => {
      if (!cancelled) setIsLoading(true);
    });

    mainnetClient
      .getEnsName({ address })
      .then((name) => {
        if (!cancelled) {
          ensCache.set(address, name);
          setEnsName(name);
        }
      })
      .catch(() => {
        if (!cancelled) {
          ensCache.set(address, null);
          setEnsName(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  return { ensName, isLoading };
}
