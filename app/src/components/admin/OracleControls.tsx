'use client';

import { useState } from 'react';
import { useReadContract } from 'wagmi';
import { MOCK_ORACLE_ABI } from '@/config/contracts';
import { useSetBtcPrice, useSetFlightStatus } from '@/hooks/useTimeControls';
import { formatBtcPrice, formatUSDC } from '@/lib/formatting';
import { POLL_INTERVAL } from '@/config/constants';
import { useAddresses } from '@/hooks/useAddresses';
import { useVaultAddresses } from '@/hooks/useVaultData';
import {
  useLensOracleDashboard,
  LensDataStatus,
  lensSourceToBadge,
} from '@/hooks/useNextBlockLens';
import { DataSourceBadge } from '@/components/shared/DataSourceBadge';

const LENS_STATUS_LABEL: Record<number, string> = {
  [LensDataStatus.UNAVAILABLE]: 'Unavailable',
  [LensDataStatus.NONE]: 'No attestation',
  [LensDataStatus.AVAILABLE]: 'Available',
  [LensDataStatus.STALE]: 'Stale',
  [LensDataStatus.PAUSED]: 'Paused',
};

/**
 * Canonical NAV oracle reading from NextBlockLens (read model). This card is
 * the institutional source of truth; the MockOracle panel below stays a
 * clearly-labelled legacy demo write tool and is never a canonical source.
 */
function LensNavCard() {
  const { data: vaultAddresses } = useVaultAddresses();
  const vault = vaultAddresses?.[0];
  const { data: oracle, lensDeployed } = useLensOracleDashboard(vault);

  const available =
    lensDeployed &&
    oracle !== undefined &&
    (oracle.status === LensDataStatus.AVAILABLE || oracle.status === LensDataStatus.STALE);

  return (
    <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-900">NAV Oracle (NextBlockLens)</h4>
        <DataSourceBadge
          source={available ? lensSourceToBadge(oracle.source) : 'unavailable'}
        />
      </div>
      {oracle !== undefined && lensDeployed ? (
        <div className="space-y-1">
          <p className="font-mono-num text-sm font-semibold text-gray-900">
            {available ? `${formatUSDC(oracle.nav)} USDC` : '--'}
          </p>
          <p className="text-xs text-gray-500">
            Status: {LENS_STATUS_LABEL[oracle.status] ?? 'Unknown'}
            {available && (
              <>
                {' '}&middot; confidence {(Number(oracle.confidenceBps) / 100).toFixed(1)}%
                {' '}&middot; updated{' '}
                {oracle.updatedAt > 0n
                  ? new Date(Number(oracle.updatedAt) * 1000).toLocaleString()
                  : 'never'}
              </>
            )}
            {oracle.anomalyFlagged && (
              <span className="ml-1 font-medium text-red-700">anomaly flagged</span>
            )}
          </p>
        </div>
      ) : (
        <p className="text-xs text-gray-400">
          Lens NAV reading unavailable on this chain.
        </p>
      )}
    </div>
  );
}

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
      <LensNavCard />

      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Oracle Controls — LEGACY DEMO (BTC / flight mock oracle)
        </h3>
        <DataSourceBadge source="demo-legacy" />
      </div>
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
