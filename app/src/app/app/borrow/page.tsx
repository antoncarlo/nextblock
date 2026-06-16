import { LendingMarketPanel } from '@/components/lending/LendingMarketPanel';
import { getLendingMarketAddress } from '@/config/lending';

export default function BorrowPage() {
  const market = getLendingMarketAddress();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Borrow</h1>
      <p className="mb-6 text-sm text-gray-500">
        Use your restricted nbRV vault shares as collateral to borrow USDC in a permissioned, isolated
        market. Compliance is enforced on-chain; the share is NAV-bearing, not a stablecoin.
      </p>
      <LendingMarketPanel marketAddress={market} />
    </div>
  );
}
