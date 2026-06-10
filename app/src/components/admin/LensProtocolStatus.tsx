'use client';

import { useChainId } from 'wagmi';
import { useLensProtocolStatus } from '@/hooks/useNextBlockLens';
import { DataSourceBadge } from '@/components/shared/DataSourceBadge';
import { isDeployed } from '@/config/contracts';

/**
 * Protocol Status card — reads EXCLUSIVELY from NextBlockLens, the canonical
 * on-chain read model (Phase 12 frontend wiring, Base Sepolia 84532 staging).
 * When the lens is not deployed on the connected chain the card declares
 * "Unavailable": it never fabricates data.
 */
export function LensProtocolStatus() {
  const chainId = useChainId();
  const { lensDeployed, lensAddress, data, isLoading, isError } = useLensProtocolStatus();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Protocol Status (NextBlockLens)
        </h2>
        <DataSourceBadge source={lensDeployed && data ? 'onchain' : 'unavailable'} />
      </div>

      {!lensDeployed ? (
        <p className="text-sm text-gray-500">
          NextBlockLens is not deployed on chain {chainId}. Switch to Base
          Sepolia (84532) staging to read the live protocol state.
        </p>
      ) : isLoading ? (
        <p className="text-sm text-gray-500">Reading protocol state from the lens…</p>
      ) : isError || !data ? (
        <p className="text-sm text-red-700">
          Lens read failed. No fallback data is shown by design.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Stat label="Vaults" value={data.vaultCount} />
            <Stat label="Portfolios" value={data.portfolioCount} />
            <Stat label="Claims" value={data.claimCount} />
            <Stat label="Bordereau assertions" value={data.assertionCount} />
            <Stat label="Adapters" value={data.adapterCount} />
            <Stat label="Allocation proposals" value={data.proposalCount} />
          </dl>
          <div className="mt-4 border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-400">
              Lens {lensAddress} · schema v{String(data.schemaVersion)} · chainId{' '}
              {String(data.chainId)} ·{' '}
              {Object.values(data.modules).filter((a) => isDeployed(a)).length}/10 modules live
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: bigint }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold text-gray-900">{value.toString()}</dd>
    </div>
  );
}
