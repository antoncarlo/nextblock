'use client';

import { useMemo } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { useVaultAddresses } from '@/hooks/useVaultData';
import { INSURANCE_VAULT_ABI } from '@/config/contracts';

/** One protocol vault seen from the connected wallet's point of view. */
export interface LpPosition {
  address: `0x${string}`;
  /** Human vault name; falls back to the share symbol, then the address. */
  name: string;
  /** nbRV shares held by the wallet in this vault. */
  shares: bigint;
  /** Shares redeemable right now within the vault's free liquidity buffer. */
  instantRedeemable: bigint;
  /** USDC the held shares are currently worth. */
  valueUsdc: bigint;
  /** True when the vault's reads reverted — state unknown, never shown as zero. */
  unreadable: boolean;
}

export interface LpPositions {
  /** Every vault the factory lists, held or not. */
  all: LpPosition[];
  /** Only the vaults where the wallet actually holds shares. */
  held: LpPosition[];
  loading: boolean;
  refetch: () => void;
}

const ZERO = '0x0000000000000000000000000000000000000000' as const;

function big(r: { status: string; result?: unknown } | undefined): bigint {
  return r?.status === 'success' && typeof r.result === 'bigint' ? r.result : 0n;
}
function str(r: { status: string; result?: unknown } | undefined): string {
  return r?.status === 'success' && typeof r.result === 'string' ? r.result : '';
}

/**
 * The connected wallet's position across every vault the factory has deployed.
 *
 * The exit screen used to show a single vault — whichever one the redemption
 * queue happened to be bound to — so an LP holding shares in any other vault
 * saw an empty balance and no explanation. Reading all vaults is what lets the
 * interface state, per vault, whether there is anything to withdraw.
 *
 * Vaults whose reads revert are marked `unreadable` rather than folded into the
 * list as a zero balance: an unknown position and an empty position are not the
 * same claim to make to someone about their money.
 */
export function useLpPositions(): LpPositions {
  const { address } = useAccount();
  const { data: vaultAddresses, isLoading: loadingVaults } = useVaultAddresses();

  const vaults = useMemo(
    () => ((vaultAddresses ?? []) as readonly `0x${string}`[]).slice(),
    [vaultAddresses],
  );
  const holder: `0x${string}` = address ?? ZERO;

  const {
    data,
    isLoading: loadingReads,
    refetch,
  } = useReadContracts({
    allowFailure: true,
    contracts: vaults.flatMap((v) => [
      { address: v, abi: INSURANCE_VAULT_ABI, functionName: 'vaultName' } as const,
      { address: v, abi: INSURANCE_VAULT_ABI, functionName: 'symbol' } as const,
      { address: v, abi: INSURANCE_VAULT_ABI, functionName: 'balanceOf', args: [holder] } as const,
      { address: v, abi: INSURANCE_VAULT_ABI, functionName: 'maxRedeem', args: [holder] } as const,
    ]),
    query: { enabled: vaults.length > 0 },
  });

  const all = useMemo<LpPosition[]>(() => {
    if (!data) return [];
    return vaults.map((v, i) => {
      const [nameR, symbolR, balR, maxR] = data.slice(i * 4, i * 4 + 4);
      const shares = big(balR);
      // maxRedeem is capped by the free buffer, but never report more than held.
      const instant = big(maxR) > shares ? shares : big(maxR);
      return {
        address: v,
        name: str(nameR) || str(symbolR) || v,
        shares,
        instantRedeemable: instant,
        // Share price is read where it is displayed; the panel only needs the
        // held amount to answer "do I have anything here".
        valueUsdc: 0n,
        unreadable: balR?.status !== 'success',
      };
    });
  }, [data, vaults]);

  const held = useMemo(() => all.filter((p) => p.shares > 0n), [all]);

  return {
    all,
    held,
    loading: loadingVaults || (vaults.length > 0 && loadingReads),
    refetch: () => void refetch(),
  };
}
