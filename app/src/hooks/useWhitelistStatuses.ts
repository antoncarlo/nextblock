'use client';

import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { COMPLIANCE_REGISTRY_ABI } from '@/config/contracts';
import { useAddresses } from '@/hooks/useAddresses';

/**
 * On-chain eligibility for a set of wallets, with the reason when it fails.
 *
 * `canReceive` is the question the vault asks before minting a share, so it is
 * the verdict. But it is an AND of several conditions, and a bare "not
 * eligible" sends the operator to the wrong remedy — as it did here: a wallet
 * was whitelisted successfully and still could not receive, because
 * `kycExpiry` was 0 and zero is always in the past.
 *
 *     canReceive = !blocked && whitelisted && kycExpiry >= now
 *
 * So each condition is read separately and the failing one is named. Setting
 * the whitelist without an expiry has no effect at all, and an interface that
 * cannot tell those two states apart sends someone round the same loop twice.
 *
 * A read that fails leaves the entry `undefined` rather than `false`: an
 * unknown state and a denial are different claims.
 */

export type EligibilityReason =
  | 'eligible'
  | 'blocked'
  | 'not-whitelisted'
  | 'kyc-missing'
  | 'kyc-expired';

export interface Eligibility {
  canReceive: boolean;
  whitelisted: boolean;
  blocked: boolean;
  kycExpiry: bigint;
  reason: EligibilityReason;
}

const LABEL: Record<EligibilityReason, string> = {
  eligible: 'on-chain ✓',
  blocked: 'blocked',
  'not-whitelisted': 'not whitelisted',
  'kyc-missing': 'KYC expiry not set',
  'kyc-expired': 'KYC expired',
};

export function eligibilityLabel(reason: EligibilityReason): string {
  return LABEL[reason];
}

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
    contracts: unique.flatMap((w) => [
      {
        address: complianceRegistry,
        abi: COMPLIANCE_REGISTRY_ABI,
        functionName: 'canReceive' as const,
        args: [w as `0x${string}`] as const,
      },
      {
        address: complianceRegistry,
        abi: COMPLIANCE_REGISTRY_ABI,
        functionName: 'whitelisted' as const,
        args: [w as `0x${string}`] as const,
      },
      {
        address: complianceRegistry,
        abi: COMPLIANCE_REGISTRY_ABI,
        functionName: 'blocked' as const,
        args: [w as `0x${string}`] as const,
      },
      {
        address: complianceRegistry,
        abi: COMPLIANCE_REGISTRY_ABI,
        functionName: 'kycExpiry' as const,
        args: [w as `0x${string}`] as const,
      },
    ]),
    query: { enabled: unique.length > 0 },
  });

  const byWallet = useMemo(() => {
    const map = new Map<string, Eligibility | undefined>();

    // No clock is read here, deliberately. `canReceive` is the chain's own
    // verdict, evaluated against the chain's own timestamp; comparing an expiry
    // to the browser clock would be a second opinion that can disagree with the
    // one that actually governs. Given canReceive is false and the wallet is
    // whitelisted and not blocked, the expiry is what failed — and 0 tells
    // "never set" apart from "lapsed" without asking the time.
    unique.forEach((w, i) => {
      const slice = data?.slice(i * 4, i * 4 + 4);
      if (!slice || slice[0]?.status !== 'success') {
        map.set(w, undefined);
        return;
      }
      const canReceive = Boolean(slice[0].result);
      const whitelisted = slice[1]?.status === 'success' ? Boolean(slice[1].result) : false;
      const blocked = slice[2]?.status === 'success' ? Boolean(slice[2].result) : false;
      const kycExpiry =
        slice[3]?.status === 'success' && typeof slice[3].result === 'bigint'
          ? (slice[3].result as bigint)
          : 0n;

      const reason: EligibilityReason = canReceive
        ? 'eligible'
        : blocked
          ? 'blocked'
          : !whitelisted
            ? 'not-whitelisted'
            : kycExpiry === 0n
              ? 'kyc-missing'
              : 'kyc-expired';

      map.set(w, { canReceive, whitelisted, blocked, kycExpiry, reason });
    });
    return map;
  }, [unique, data]);

  return {
    byWallet,
    get: (wallet: string) => byWallet.get(wallet.toLowerCase()),
    /** undefined while unknown, so callers can distinguish it from a denial. */
    isAllowed: (wallet: string) => byWallet.get(wallet.toLowerCase())?.canReceive,
    isLoading,
    refetch: () => void refetch(),
  };
}
