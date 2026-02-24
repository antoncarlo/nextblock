'use client';

import { useState } from 'react';
import { useReadContract } from 'wagmi';
import { MOCK_ORACLE_ABI } from '@/config/contracts';
import { useSetBtcPrice, useSetFlightStatus } from '@/hooks/useTimeControls';
import { formatBtcPrice } from '@/lib/formatting';
import { POLL_INTERVAL } from '@/config/constants';
import { useAddresses } from '@/hooks/useAddresses';

export function OracleControls() {
  const addresses = useAddresses();
  const [btcInput, setBtcInput] = useState('');

  // Read current oracle state
  const { data: btcData } = useReadContract({
    address: addresses.mockOracle,
    abi: MOCK_ORACLE_ABI,
    functionName: 'getBtcPrice',
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: addresses.mockOracle !== '0x0000000000000000000000000000000000000000',
    },
  });

  const { data: flightData } = useReadContract({
    address: addresses.mockOracle,
    abi: MOCK_ORACLE_ABI,
    functionName: 'getFlightStatus',
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: addresses.mockOracle !== '0x0000000000000000000000000000000000000000',
    },
  });

  const { setBtcPrice, isPending: btcPending } = useSetBtcPrice();
  const { setFlightStatus, isPending: flightPending } = useSetFlightStatus();

  const currentBtcPrice = btcData
    ? formatBtcPrice((btcData as unknown as [bigint, bigint])[0])
    : '--';
  const currentFlightDelayed = flightData
    ? (flightData as unknown as [boolean, bigint])[0]
    : false;

  const handleSetBtcPrice = () => {
    const price = parseFloat(btcInput);
    if (price > 0) {
      // Convert to 8 decimals (Chainlink convention)
      setBtcPrice(BigInt(Math.round(price * 1e8)));
      setBtcInput('');
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="mb-1 text-sm font-semibold text-gray-900">
        Oracle Controls
      </h3>
      <p className="mb-4 text-xs text-gray-500">
        Set oracle values to trigger claim conditions.
      </p>

      {/* BTC Price */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700">BTC Price</span>
          <span className="font-mono-num text-xs text-gray-500">
            Current: {currentBtcPrice}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="e.g. 75000"
            value={btcInput}
            onChange={(e) => setBtcInput(e.target.value)}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:border-gray-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSetBtcPrice}
            disabled={btcPending || !btcInput}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
          >
            {btcPending ? '...' : 'Set'}
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setBtcPrice(BigInt(85000 * 1e8));
            }}
            disabled={btcPending}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            $85K (safe)
          </button>
          <button
            type="button"
            onClick={() => {
              setBtcPrice(BigInt(75000 * 1e8));
            }}
            disabled={btcPending}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            $75K (trigger)
          </button>
        </div>
      </div>

      {/* Flight Delay */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700">
            Flight Status
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              currentFlightDelayed
                ? 'bg-red-50 text-red-700'
                : 'bg-green-50 text-green-700'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                currentFlightDelayed ? 'bg-red-500' : 'bg-green-500'
              }`}
            />
            {currentFlightDelayed ? 'Delayed' : 'On Time'}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFlightStatus(false)}
            disabled={flightPending || !currentFlightDelayed}
            className="flex-1 rounded-lg border border-green-200 px-3 py-2 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50"
          >
            Set On Time
          </button>
          <button
            type="button"
            onClick={() => setFlightStatus(true)}
            disabled={flightPending || currentFlightDelayed}
            className="flex-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            Set Delayed
          </button>
        </div>
      </div>
    </div>
  );
}
