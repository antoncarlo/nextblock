'use client';

import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useVaultInfoSafe, useUserShares } from '@/hooks/useVaultData';
import { useOfferingTerms } from '@/hooks/useOfferingTerms';
import { resolveVaultDisplay } from '@/config/vaultDisplay';
import { formatUSDC, getSharePriceNumber } from '@/lib/formatting';
import { SHARE_SYMBOL } from '@/lib/disclosure';

/**
 * One line per vault the LP holds. Vaults with no position render nothing —
 * a portfolio should show what you own, not every vault that exists.
 */
export function PositionRow({ vaultAddress }: { vaultAddress: `0x${string}` }) {
  const { address } = useAccount();
  const { data: vaultInfo } = useVaultInfoSafe(vaultAddress);
  const { data: shares } = useUserShares(vaultAddress, address);
  const { terms } = useOfferingTerms();

  if (!vaultInfo || !shares || shares === 0n) return null;

  const [name, , assets, totalSupply] = vaultInfo as unknown as [
    string,
    `0x${string}`,
    bigint,
    bigint,
    ...unknown[],
  ];
  const display = resolveVaultDisplay(name, terms.get(vaultAddress.toLowerCase()));
  const sharePrice = getSharePriceNumber(assets, totalSupply);
  // Shares are 18-dec over 6-dec USDC; sharePrice is already USDC-per-share.
  const valueUsdc = BigInt(Math.round((Number(shares) / 1e18) * sharePrice * 1e6));

  return (
    <Link
      href={`/app/vault/${vaultAddress}`}
      className="flex items-center justify-between border-b border-gray-100 px-5 py-4 transition-colors last:border-b-0 hover:bg-gray-50"
      style={{ textDecoration: 'none' }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
        <p className="mt-0.5 truncate text-xs text-gray-500">{display.manager}</p>
      </div>
      <div className="ml-4 shrink-0 text-right">
        <p className="text-sm font-semibold text-gray-900">{formatUSDC(valueUsdc)}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          {(Number(shares) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 2 })} {SHARE_SYMBOL}
        </p>
      </div>
    </Link>
  );
}
