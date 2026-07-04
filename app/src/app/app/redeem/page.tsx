import { RedemptionPanel } from '@/components/redemption/RedemptionPanel';
import { RedemptionHistory } from '@/components/redemption/RedemptionHistory';
import { getRedemptionQueueAddress } from '@/config/redemption';

export default function RedeemPage() {
  const queue = getRedemptionQueueAddress();
  return (
    <div data-track-section="redeem_panel" className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Redeem</h1>
      <p className="mb-6 text-sm text-gray-500">
        Exit your restricted nbRV vault position. Redemptions within the vault&apos;s free liquidity
        buffer settle instantly; larger exits queue for pro-rata settlement at epoch close, removing
        the first-come bank-run dynamic. The share is NAV-bearing, not a stablecoin.
      </p>
      <RedemptionPanel queueAddress={queue} />
      <RedemptionHistory />
    </div>
  );
}
