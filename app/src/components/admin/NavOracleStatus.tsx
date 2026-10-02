'use client';

import { formatUSDC } from '@/lib/formatting';
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
 * Canonical NAV oracle reading from NextBlockLens (read model): the
 * institutional source of truth for the vault NAV.
 */
export function NavOracleStatus() {
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
                {' '}&middot; report <span className="font-mono">{oracle.sourceHash.slice(0, 10)}…</span>
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
