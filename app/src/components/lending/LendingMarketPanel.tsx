'use client';

import { useState } from 'react';
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useAddresses } from '@/hooks/useAddresses';
import { useLendingMarket } from '@/hooks/useLendingMarket';
import { LENDING_MARKET_ABI, LENDING_CHAIN_ID } from '@/config/lending';
import { MOCK_USDC_ABI } from '@/config/contracts';
import { parseUSDC, formatUSDC } from '@/lib/formatting';
import { SHARE_SYMBOL, SHARE_DISCLAIMER } from '@/lib/disclosure';

interface LendingMarketPanelProps {
  /** Deployed LendingMarket address, or undefined when not yet deployed. */
  marketAddress?: `0x${string}`;
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as const;

/**
 * Borrower/lender panel for a permissioned LendingMarket: borrow USDC against
 * restricted nbRV collateral. Renders an explicit "not deployed" state until a
 * market address is configured. The vault share is NAV-bearing, not a stablecoin
 * (see disclaimer).
 */
export function LendingMarketPanel({ marketAddress }: LendingMarketPanelProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const addresses = useAddresses();
  const market = useLendingMarket(marketAddress);

  const [amount, setAmount] = useState('');
  const parsed = parseUSDC(amount);
  const wrongChain = chainId !== LENDING_CHAIN_ID;

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  function approveUsdc() {
    if (!marketAddress) return;
    writeContract({ address: addresses.mockUSDC, abi: MOCK_USDC_ABI, functionName: 'approve', args: [marketAddress, parsed] });
  }
  function doSupply() {
    if (!marketAddress) return;
    writeContract({ address: marketAddress, abi: LENDING_MARKET_ABI, functionName: 'supply', args: [parsed] });
  }
  function doRepay() {
    if (!marketAddress) return;
    writeContract({ address: marketAddress, abi: LENDING_MARKET_ABI, functionName: 'repay', args: [parsed] });
  }
  function doBorrow() {
    if (!marketAddress) return;
    writeContract({ address: marketAddress, abi: LENDING_MARKET_ABI, functionName: 'borrow', args: [parsed, address ?? ZERO_ADDR] });
  }

  // --- Not deployed yet ---
  if (!marketAddress || !market.available) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Borrow against {SHARE_SYMBOL}</h3>
        </div>
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-gray-500">
            The permissioned lending market is not yet deployed on this network.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Once a market is live, you will be able to post {SHARE_SYMBOL} as collateral and borrow USDC here.
          </p>
        </div>
        <Disclaimer />
      </div>
    );
  }

  const pct = (bps: bigint | number) => `${(Number(bps) / 100).toFixed(0)}%`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Borrow against {SHARE_SYMBOL}</h3>
        {market.paused && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">paused</span>
        )}
      </div>

      <div className="space-y-4 p-4">
        {/* Market metrics */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Metric label="Max LTV" value={pct(market.lltvBps)} />
          <Metric label="Liquidation LTV" value={pct(market.liqLtvBps)} />
          <Metric label="Supplied" value={`${formatUSDC(market.totalSupplyAssets)} USDC`} />
          <Metric label="Borrowed" value={`${formatUSDC(market.totalBorrowAssets)} USDC`} />
          <Metric label="Utilization" value={pct(market.utilizationBps)} />
          <Metric label="Available" value={`${formatUSDC(market.totalSupplyAssets - market.totalBorrowAssets)} USDC`} />
        </div>

        {/* Connected position */}
        {isConnected && (
          <div className="rounded-lg border border-gray-100 px-3 py-2">
            <p className="mb-1 text-xs text-gray-500">Your position</p>
            <div className="grid grid-cols-2 gap-1 text-xs text-gray-700">
              <span>Supplied: {formatUSDC(market.userSupplyShares)} sh</span>
              <span>Collateral: {(Number(market.userCollateral) / 1e18).toFixed(2)} {SHARE_SYMBOL}</span>
              <span>Debt: {formatUSDC(market.userDebt)} USDC</span>
              <span>
                Health:{' '}
                <span className={market.userHealthy ? 'font-medium text-emerald-700' : 'font-medium text-red-700'}>
                  {market.userHealthy ? 'healthy' : 'at risk'}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        {!isConnected ? (
          <p className="py-2 text-center text-sm text-gray-500">Connect your wallet to interact.</p>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (USDC)"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
            />
            {wrongChain && (
              <div className="rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800">
                Switch to Base Sepolia (chain {LENDING_CHAIN_ID}) to transact.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <ActionButton label="Approve USDC" onClick={approveUsdc} disabled={wrongChain || parsed <= 0n || isPending || confirming} />
              <ActionButton label="Supply" onClick={doSupply} disabled={wrongChain || parsed <= 0n || isPending || confirming} />
              <ActionButton label="Borrow" onClick={doBorrow} disabled={wrongChain || parsed <= 0n || isPending || confirming} primary />
              <ActionButton label="Repay" onClick={doRepay} disabled={wrongChain || parsed <= 0n || isPending || confirming} />
            </div>
            {(isPending || confirming) && (
              <p className="text-center text-xs text-gray-400">Confirm in wallet / waiting for confirmation...</p>
            )}
            {isSuccess && (
              <p className="text-center text-xs font-medium text-emerald-600">
                Transaction confirmed.{' '}
                <button type="button" onClick={() => { setAmount(''); market.refetch(); reset(); }} className="underline">
                  reset
                </button>
              </p>
            )}
            {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error.message.slice(0, 140)}</p>}
            <p className="text-[11px] text-gray-400">
              Collateral ({SHARE_SYMBOL}) deposit/withdraw is managed from the vault position view.
            </p>
          </div>
        )}
      </div>

      <Disclaimer />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-1.5">
      <p className="text-gray-400">{label}</p>
      <p className="font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 ${
        primary ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}

function Disclaimer() {
  return (
    <div className="border-t border-gray-100 px-4 py-3">
      <p className="text-[11px] leading-snug text-gray-400">{SHARE_DISCLAIMER}</p>
    </div>
  );
}
