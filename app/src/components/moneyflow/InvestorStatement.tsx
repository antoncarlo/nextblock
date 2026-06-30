'use client';

import { useAccount } from 'wagmi';
import { useLensLPStatus, LensDataStatus } from '@/hooks/useNextBlockLens';
import { formatUSDC } from '@/lib/formatting';
import { SHARE_SYMBOL, SHARE_DISCLAIMER } from '@/lib/disclosure';

/**
 * Per-LP investor statement (current position): shares, current asset value,
 * withdrawable amount and compliance status, from the canonical lens read model.
 * Realized yield / deposit-withdrawal history needs the event indexer (deferred).
 */
export function InvestorStatement({ vault }: { vault?: `0x${string}` }) {
  const { address, isConnected } = useAccount();
  const { data: lp, lensDeployed } = useLensLPStatus(vault, address);
  const available = lensDeployed && !!lp && Number(lp.vaultStatus) === LensDataStatus.AVAILABLE;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Investor Statement</h3>
      </div>

      <div className="p-4">
        {!isConnected ? (
          <p className="py-6 text-center text-sm text-gray-500">Connect your wallet to view your statement.</p>
        ) : !available || !lp ? (
          <p className="py-6 text-center text-sm text-gray-500">Position unavailable on this network.</p>
        ) : (
          <div className="space-y-1.5 text-sm">
            <Row label={`Shares (${SHARE_SYMBOL})`} value={(Number(lp.shareBalance) / 1e18).toFixed(4)} />
            <Row label="Current value" value={`${formatUSDC(lp.assetValue)} USDC`} strong />
            <Row label="Withdrawable now" value={`${formatUSDC(lp.maxWithdraw)} USDC`} />
            <Row
              label="Compliance"
              value={
                lp.blocked
                  ? 'blocked'
                  : !lp.whitelisted
                    ? 'not whitelisted'
                    : lp.kycExpired
                      ? 'KYC expired'
                      : 'whitelisted'
              }
            />
            <p className="pt-2 text-[11px] leading-snug text-gray-400">
              Current position only. Deposit/withdrawal history and realized yield require the event
              indexer and are not shown here.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 px-4 py-3">
        <p className="text-[11px] leading-snug text-gray-400">{SHARE_DISCLAIMER}</p>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={strong ? 'font-semibold text-gray-900' : 'text-gray-700'}>{value}</span>
    </div>
  );
}
