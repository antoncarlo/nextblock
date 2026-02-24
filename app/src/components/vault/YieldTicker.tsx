'use client';

import { formatUSDC, getSharePriceNumber } from '@/lib/formatting';

interface YieldTickerProps {
  totalAssets: bigint;
  totalSupply: bigint;
}

export function YieldTicker({ totalAssets, totalSupply }: YieldTickerProps) {
  const sharePrice = getSharePriceNumber(totalAssets, totalSupply);
  const pnlPct = ((sharePrice - 1.0) * 100);
  const isPositive = pnlPct >= 0;

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            NAV per Share
          </p>
          <p className="font-mono-num mt-1 text-2xl font-bold text-gray-900">
            ${sharePrice.toFixed(4)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            P&L
          </p>
          <p
            className={`font-mono-num mt-1 text-lg font-semibold ${
              isPositive ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {isPositive ? '+' : ''}
            {pnlPct.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* TVL */}
      <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-3">
        <span className="text-xs text-gray-400">Total Value Locked</span>
        <span className="font-mono-num text-sm font-medium text-gray-700">
          {formatUSDC(totalAssets)}
        </span>
      </div>
    </div>
  );
}
