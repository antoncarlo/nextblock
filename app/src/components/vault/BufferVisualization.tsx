'use client';

import { formatUSDC, formatBufferRatio } from '@/lib/formatting';

interface BufferVisualizationProps {
  totalAssets: bigint;
  deployedCapital: bigint;
  pendingClaims: bigint;
  bufferBps: bigint;
}

export function BufferVisualization({
  totalAssets,
  deployedCapital,
  pendingClaims,
  bufferBps,
}: BufferVisualizationProps) {
  // Use totalAssets (TVL) as the 100% base so segments always sum to TVL.
  // Exposure is capped at totalAssets to avoid exceeding the bar.
  const tvl = Number(totalAssets);
  const exposure = Math.min(Number(deployedCapital), tvl);
  const pending = Math.min(Number(pendingClaims), Math.max(tvl - exposure, 0));
  const free = Math.max(tvl - exposure - pending, 0);

  const exposurePct = tvl > 0 ? (exposure / tvl) * 100 : 0;
  const pendingPct = tvl > 0 ? (pending / tvl) * 100 : 0;
  const freePct = tvl > 0 ? (free / tvl) * 100 : 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Capital Allocation</h3>
        <span className="text-xs text-gray-400">
          Target buffer: {formatBufferRatio(bufferBps)}
        </span>
      </div>

      {/* Stacked bar */}
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-100">
        {exposurePct > 0 && (
          <div
            className="bg-blue-400 transition-all duration-500"
            style={{ width: `${exposurePct}%` }}
            title={`Policy Exposure: ${formatUSDC(BigInt(Math.round(exposure)))}`}
          />
        )}
        {pendingPct > 0 && (
          <div
            className="bg-red-400 transition-all duration-500"
            style={{ width: `${pendingPct}%` }}
            title={`Pending Claims: ${formatUSDC(BigInt(Math.round(pending)))}`}
          />
        )}
        {freePct > 0 && (
          <div
            className="bg-emerald-400 transition-all duration-500"
            style={{ width: `${freePct}%` }}
            title={`Free Capital: ${formatUSDC(BigInt(Math.round(free)))}`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-4">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-400" />
          <span className="text-xs text-gray-600">
            Policy Exposure{' '}
            <span className="font-mono-num font-medium">
              {formatUSDC(BigInt(Math.round(exposure)))}
            </span>
          </span>
        </div>
        {pending > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-red-400" />
            <span className="text-xs text-gray-600">
              Pending Claims{' '}
              <span className="font-mono-num font-medium">
                {formatUSDC(BigInt(Math.round(pending)))}
              </span>
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
          <span className="text-xs text-gray-600">
            Free Capital{' '}
            <span className="font-mono-num font-medium">
              {formatUSDC(BigInt(Math.round(free)))}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
