'use client';

import { useAccount, useReadContracts } from 'wagmi';
import { LENDING_MARKET_ABI } from '@/config/lending';

export interface LendingMarketData {
  /** True only when a market address is configured and its reads resolved. */
  available: boolean;
  paused: boolean;
  lltvBps: bigint;
  liqLtvBps: bigint;
  totalSupplyAssets: bigint;
  totalBorrowAssets: bigint;
  totalCollateral: bigint;
  /** Utilization in basis points (borrow / supply). */
  utilizationBps: number;
  collateralToken?: `0x${string}`;
  // Connected-wallet position
  userSupplyShares: bigint;
  userCollateral: bigint;
  userDebt: bigint;
  userHealthy: boolean;
  refetch: () => void;
}

type ReadResult = { status: 'success' | 'failure'; result?: unknown } | undefined;

function asBig(r: ReadResult): bigint {
  return r && r.status === 'success' && typeof r.result === 'bigint' ? r.result : 0n;
}
function asBool(r: ReadResult): boolean {
  return !!r && r.status === 'success' && r.result === true;
}
function asAddr(r: ReadResult): `0x${string}` | undefined {
  return r && r.status === 'success' && typeof r.result === 'string' ? (r.result as `0x${string}`) : undefined;
}

/**
 * Reads permissioned LendingMarket state for the dashboard. Market-level metrics
 * plus the connected wallet's supply/collateral/debt/health. Returns
 * `available: false` until a market address is configured (see `getLendingMarketAddress`).
 */
export function useLendingMarket(market?: `0x${string}`): LendingMarketData {
  const { address } = useAccount();

  // Fallback keeps the contracts array a stable, well-typed shape; `enabled`
  // gates actual execution to when a real market (and wallet) are present.
  const FALLBACK = '0x0000000000000000000000000000000000000000' as const;
  const mkAddr: `0x${string}` = market ?? FALLBACK;
  const userAddr: `0x${string}` = address ?? FALLBACK;

  const { data: mkt, refetch } = useReadContracts({
    contracts: [
      { address: mkAddr, abi: LENDING_MARKET_ABI, functionName: 'lltvBps' },
      { address: mkAddr, abi: LENDING_MARKET_ABI, functionName: 'liqLtvBps' },
      { address: mkAddr, abi: LENDING_MARKET_ABI, functionName: 'totalSupplyAssets' },
      { address: mkAddr, abi: LENDING_MARKET_ABI, functionName: 'totalBorrowAssets' },
      { address: mkAddr, abi: LENDING_MARKET_ABI, functionName: 'totalCollateral' },
      { address: mkAddr, abi: LENDING_MARKET_ABI, functionName: 'paused' },
      { address: mkAddr, abi: LENDING_MARKET_ABI, functionName: 'collateralToken' },
    ],
    query: { enabled: !!market },
  });

  const { data: usr, refetch: refetchUser } = useReadContracts({
    contracts: [
      { address: mkAddr, abi: LENDING_MARKET_ABI, functionName: 'supplyShares', args: [userAddr] },
      { address: mkAddr, abi: LENDING_MARKET_ABI, functionName: 'collateralOf', args: [userAddr] },
      { address: mkAddr, abi: LENDING_MARKET_ABI, functionName: 'borrowAssetsOf', args: [userAddr] },
      { address: mkAddr, abi: LENDING_MARKET_ABI, functionName: 'isHealthy', args: [userAddr] },
    ],
    query: { enabled: !!market && !!address },
  });

  const m = (mkt ?? []) as ReadResult[];
  const u = (usr ?? []) as ReadResult[];

  const totalSupplyAssets = asBig(m[2]);
  const totalBorrowAssets = asBig(m[3]);
  const utilizationBps =
    totalSupplyAssets > 0n ? Number((totalBorrowAssets * 10_000n) / totalSupplyAssets) : 0;

  return {
    available: !!market && m[0]?.status === 'success',
    paused: asBool(m[5]),
    lltvBps: asBig(m[0]),
    liqLtvBps: asBig(m[1]),
    totalSupplyAssets,
    totalBorrowAssets,
    totalCollateral: asBig(m[4]),
    utilizationBps,
    collateralToken: asAddr(m[6]),
    userSupplyShares: asBig(u[0]),
    userCollateral: asBig(u[1]),
    userDebt: asBig(u[2]),
    userHealthy: u.length > 0 ? asBool(u[3]) : true,
    refetch: () => {
      refetch();
      refetchUser();
    },
  };
}
