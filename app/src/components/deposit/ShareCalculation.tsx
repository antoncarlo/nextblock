'use client';

import { getSharePriceNumber } from '@/lib/formatting';

interface ShareCalculationProps {
  mode: 'deposit' | 'withdraw';
  amount: bigint;
  totalAssets: bigint;
  totalSupply: bigint;
}

export function ShareCalculation({
  mode,
  amount,
  totalAssets,
  totalSupply,
}: ShareCalculationProps) {
  const sharePrice = getSharePriceNumber(totalAssets, totalSupply);
  const amountUSDC = Number(amount) / 1e6;

  if (amount <= 0n) return null;

  if (mode === 'deposit') {
    // shares = amount / sharePrice
    const sharesEstimate = sharePrice > 0 ? amountUSDC / sharePrice : 0;

    return (
      <div className="rounded-lg bg-gray-50 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">You will receive</span>
          <span className="font-mono-num text-sm font-semibold text-gray-900">
            ~{sharesEstimate.toLocaleString('en-US', { maximumFractionDigits: 2 })} shares
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-xs text-gray-500">Exchange rate</span>
          <span className="font-mono-num text-xs text-gray-600">
            1 share = ${sharePrice.toFixed(4)} USDC
          </span>
        </div>
      </div>
    );
  }

  // Withdraw mode: user gets USDC
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">You will receive</span>
        <span className="font-mono-num text-sm font-semibold text-gray-900">
          ~${amountUSDC.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs text-gray-500">Exchange rate</span>
        <span className="font-mono-num text-xs text-gray-600">
          1 share = ${sharePrice.toFixed(4)} USDC
        </span>
      </div>
    </div>
  );
}
