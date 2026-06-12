'use client';

import { useAccount, useChainId } from 'wagmi';
import { DataSourceBadge } from './DataSourceBadge';

/** The institutional protocol stack is deployed on Base Sepolia only. */
const INSTITUTIONAL_CHAIN_ID = 84532;

/**
 * Full-width notice rendered across the app area whenever the connected
 * wallet is on a chain other than Base Sepolia. Other configured chains
 * (Ethereum Sepolia, Arc) carry only legacy demo contracts: every vault and
 * strategy is unavailable there, and this banner says so instead of letting
 * pages fail read-by-read.
 */
export function NetworkAvailabilityNotice() {
  const { isConnected } = useAccount();
  const chainId = useChainId();

  if (!isConnected || chainId === INSTITUTIONAL_CHAIN_ID) return null;

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        margin: '16px auto 0 auto',
        maxWidth: '1200px',
        padding: '12px 16px',
        borderRadius: 8,
        background: 'rgba(127,29,29,0.06)',
        border: '1px solid rgba(127,29,29,0.2)',
        color: '#7F1D1D',
        fontSize: 13,
      }}
    >
      <DataSourceBadge
        source="unavailable"
        title="Vaults and strategies are unavailable on this network"
      />
      <span>
        <strong>Unavailable on this network.</strong> Vaults and strategies of
        the institutional protocol are deployed on Base Sepolia (chain 84532)
        only; this network carries legacy demo contracts at most. Switch
        network to operate.
      </span>
    </div>
  );
}
