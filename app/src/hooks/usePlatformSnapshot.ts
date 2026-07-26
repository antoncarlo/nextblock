'use client';

import { useMemo } from 'react';
import { useVaultAddresses, useMultiVaultInfo } from '@/hooks/useVaultData';
import { aggregatePlatform, type VaultSnapshot, type PlatformTotals } from '@/lib/platform-metrics';

/**
 * Live protocol snapshot: every deployed vault, read straight from chain.
 *
 * The vault list comes from `VaultFactory.getVaults()`, so a vault deployed
 * tomorrow appears here with no code change — the page grows with the protocol.
 * Vaults whose read reverts are counted separately and excluded from the
 * totals, never silently treated as zero.
 */
export function usePlatformSnapshot(): {
  vaults: VaultSnapshot[];
  totals: PlatformTotals;
  isLoading: boolean;
  hasFactory: boolean;
} {
  const { data: addresses, isLoading: loadingAddresses } = useVaultAddresses();
  const { data: infos, isLoading: loadingInfos } = useMultiVaultInfo(addresses);

  const { vaults, unreadable } = useMemo(() => {
    if (!addresses || !infos) return { vaults: [] as VaultSnapshot[], unreadable: 0 };

    const out: VaultSnapshot[] = [];
    let bad = 0;

    addresses.forEach((address, i) => {
      const info = infos[i];
      if (!info || info.status !== 'success' || !info.result) {
        bad += 1;
        return;
      }
      // getVaultInfo(): name, manager, totalAssets, totalSupply, sharePrice,
      // bufferRatioBps, managementFeeBps, availableBuffer, deployedCapital,
      // policyCount — the canonical read-model tuple.
      const t = info.result as unknown as [
        string,
        `0x${string}`,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
      ];
      out.push({
        address,
        name: t[0],
        totalAssets: t[2],
        totalSupply: t[3],
        bufferRatioBps: Number(t[5]),
        availableBuffer: t[7],
        deployedCapital: t[8],
        // Claim reserves are not part of the tuple; the vault reports NAV net of
        // them, so protocol-level reserves are derived per-vault elsewhere and
        // left at zero here rather than guessed.
        pendingClaims: 0n,
        policyCount: Number(t[9]),
      });
    });

    return { vaults: out, unreadable: bad };
  }, [addresses, infos]);

  return {
    vaults,
    totals: aggregatePlatform(vaults, unreadable),
    isLoading: loadingAddresses || loadingInfos,
    hasFactory: Boolean(addresses),
  };
}
