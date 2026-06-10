'use client';

import { DataSourceBadge } from '@/components/shared/DataSourceBadge';

/**
 * RETIRED (Phase 9.5): the legacy claim triggers (BTC price / flight delay /
 * manual insurer claim) were removed from InsuranceVault. This panel is kept
 * as an explicit notice so the admin dashboard never implies the old
 * auto-payout path still exists.
 */
export function ClaimTriggers(_props: { vaultAddresses?: readonly `0x${string}`[]; vaultNames?: string[] }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid rgba(127,29,29,0.2)', borderRadius: '16px', padding: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7F1D1D', margin: 0 }}>
          Legacy Claim Triggers — Removed
        </h3>
        <DataSourceBadge source="unavailable" title="Functions removed on-chain in Phase 9.5" />
      </div>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#5A5A5A', lineHeight: 1.7, margin: 0 }}>
        The demo claim triggers (<code>checkClaim</code>, <code>reportEvent</code>,{' '}
        <code>submitClaim</code>, <code>exerciseClaim</code>) were removed from the
        vault in the Phase 9.5 security hardening: they allowed payouts that
        bypassed the Claims Committee and the mandatory dispute window. Claims now
        flow exclusively through the <strong>ClaimManager</strong> lifecycle
        (Submitted → Assessed → Disputed → Approved → Paid / Rejected), with the
        vault as sole payout executor.
      </p>
    </div>
  );
}
