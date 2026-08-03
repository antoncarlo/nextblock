'use client';

import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { COMPLIANCE_REGISTRY_ABI } from '@/config/contracts';
import { useAddresses } from '@/hooks/useAddresses';

/**
 * On-chain whitelist state for a set of wallets.
 *
 * The KYB queue used to show the database status alone. An application marked
 * "approved" therefore looked finished while the wallet was still unable to do
 * anything, because approving in the database whitelists nobody — the
 * ComplianceRegistry write is a separate act, and it is the only one that
 * counts.
 *
 * `canReceive` is the question the vault actually asks before minting shares,
 * so it is the one asked here: it folds in the whitelist flag, the blocked
 * flag and KYC expiry, which is more than an `isWhitelisted` read would.
 *
 * A read that fails leaves the entry `undefined` rather than `false`. Reporting
 * "not whitelisted" for a wallet whose state could not be read would invite
 * someone to re-send a transaction that was never needed.
 */
export function useWhitelistStatuses(wallets: readonly string[]) {
  const { complianceRegistry } = useAddresses();

  const unique = useMemo(() => {
    const seen = new Set<string>();
    for (const w of wallets) {
      if (/^0x[0-9a-fA-F]{40}$/.test(w)) seen.add(w.toLowerCase());
    }
    return [...seen];
  }, [wallets]);

  const { data, isLoading, refetch } = useReadContracts({
    allowFailure: true,
    contracts: unique.map((w) => ({
      address: complianceRegistry,
      abi: COMPLIANCE_REGISTRY_ABI,
      functionName: 'canReceive' as const,
      args: [w as `0x${string}`] as const,
    })),
    query: { enabled: unique.length > 0 },
  });

  /** wallet (lowercase) → true / false / undefined when unreadable. */
  const byWallet = useMemo(() => {
    const map = new Map<string, boolean | undefined>();
    unique.forEach((w, i) => {
      const r = data?.[i];
      map.set(w, r?.status === 'success' ? Boolean(r.result) : undefined);
    });
    return map;
  }, [unique, data]);

  return {
    byWallet,
    /** Convenience: undefined while unknown, so callers can distinguish. */
    isAllowed: (wallet: string) => byWallet.get(wallet.toLowerCase()),
    isLoading,
    refetch: () => void refetch(),
  };
}
