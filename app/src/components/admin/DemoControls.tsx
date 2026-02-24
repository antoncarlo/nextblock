'use client';

import { useState } from 'react';
import { useMintUSDC } from '@/hooks/useTimeControls';
import { parseUSDC, formatUSDC } from '@/lib/formatting';

export function DemoControls() {
  const [mintAddress, setMintAddress] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const { mint, isPending, isSuccess } = useMintUSDC();

  const handleMint = () => {
    if (mintAddress && mintAmount) {
      const amount = parseUSDC(mintAmount);
      if (amount > 0n) {
        mint(mintAddress as `0x${string}`, amount);
      }
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="mb-1 text-sm font-semibold text-gray-900">
        Demo Controls
      </h3>
      <p className="mb-4 text-xs text-gray-500">
        Utilities for demo setup and management.
      </p>

      {/* Mint USDC */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Mint MockUSDC
        </label>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Recipient address (0x...)"
            value={mintAddress}
            onChange={(e) => setMintAddress(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:border-gray-400 focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Amount (USDC)"
              value={mintAmount}
              onChange={(e) => setMintAmount(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:border-gray-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleMint}
              disabled={isPending || !mintAddress || !mintAmount}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {isPending ? '...' : 'Mint'}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMintAmount('10000')}
              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              $10K
            </button>
            <button
              type="button"
              onClick={() => setMintAmount('50000')}
              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              $50K
            </button>
            <button
              type="button"
              onClick={() => setMintAmount('100000')}
              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              $100K
            </button>
          </div>
          {isSuccess && (
            <p className="text-xs text-emerald-600">
              MockUSDC minted successfully.
            </p>
          )}
        </div>
      </div>

      {/* Reset instructions */}
      <div className="rounded-lg bg-gray-50 p-3">
        <p className="text-xs font-medium text-gray-700">Reset Demo</p>
        <p className="mt-1 text-xs text-gray-500">
          To reset the demo state, re-run the deployment script:
        </p>
        <code className="mt-1 block rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
          forge script script/DemoSetup.s.sol --rpc-url $RPC --broadcast
        </code>
        <p className="mt-1 text-xs text-gray-400">
          This deploys fresh contracts in under 30 seconds on Anvil.
        </p>
      </div>
    </div>
  );
}
