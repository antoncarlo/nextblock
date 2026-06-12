'use client';

import { useAccount } from 'wagmi';
import { NEXTBLOCK_ROLES } from '@/config/generated/addressBook';

/**
 * Prominent warning rendered whenever the connected wallet IS the staging
 * deployer EOA. Until Governance Phase 2 completes (Stage A key separation,
 * then Stage B renounce) this single key still holds OWNER_ROLE,
 * DEFAULT_ADMIN_ROLE and every operational role, bypassing the timelock:
 * the highest-severity finding of the production readiness audit. The
 * banner keeps that fact impossible to forget during day-to-day use.
 */
export function DeployerWalletWarning() {
  const { address, isConnected } = useAccount();
  const deployer = NEXTBLOCK_ROLES.deployer;

  if (!isConnected || !address || !deployer) return null;
  if (address.toLowerCase() !== deployer.toLowerCase()) return null;

  return (
    <div
      role="alert"
      style={{
        display: 'block',
        margin: '16px auto 0 auto',
        maxWidth: '1200px',
        padding: '14px 18px',
        borderRadius: 8,
        background: 'rgba(146,64,14,0.08)',
        border: '2px solid rgba(146,64,14,0.45)',
        color: '#92400E',
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <strong>Deployer key connected - governance handover incomplete.</strong>{' '}
      This wallet still holds OWNER_ROLE, DEFAULT_ADMIN_ROLE and all
      operational roles on ProtocolRoles, with full instant control that
      bypasses the timelock. The protocol must NOT be used in production
      until Governance Phase 2 Stage A (key separation) and Stage B
      (renounce) are executed and verified. Runbook:
      docs/GOVERNANCE_PHASE2.md. Avoid routine operations with this key.
    </div>
  );
}
