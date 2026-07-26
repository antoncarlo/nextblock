'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { NEXTBLOCK_ROLES } from '@/config/generated/addressBook';

/**
 * Warning shown when the connected wallet IS the staging deployer EOA.
 *
 * Until Governance Phase 2 completes (Stage A key separation, then Stage B
 * renounce) this single key holds OWNER_ROLE, DEFAULT_ADMIN_ROLE and every
 * operational role, bypassing the timelock — the highest-severity finding of
 * the readiness audit. The fact must stay visible, so this is NOT removable:
 * it collapses to one line, expands on demand, and can be hidden **for the
 * session only** (sessionStorage, not localStorage — a security notice that
 * disappears forever is a security notice nobody reads twice).
 */
export function DeployerWalletWarning() {
  const { address, isConnected } = useAccount();
  const deployer = NEXTBLOCK_ROLES.deployer;

  const [hidden, setHidden] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem('nb-deployer-warning-hidden') === '1';
    } catch {
      // storage unavailable: keep the warning visible, the safe default
      return false;
    }
  });
  const [expanded, setExpanded] = useState(false);

  const isDeployer =
    isConnected && address && deployer && address.toLowerCase() === deployer.toLowerCase();
  if (!isDeployer || hidden) return null;

  return (
    <div
      role="alert"
      className="mx-auto mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-2.5"
      style={{
        maxWidth: 1200,
        background: 'rgba(146,64,14,0.07)',
        border: '1px solid rgba(146,64,14,0.35)',
        color: '#92400E',
        fontSize: 13,
      }}
    >
      <span className="font-semibold">Deployer key connected</span>
      <span style={{ opacity: 0.85 }}>Full control, timelock bypassed — not for production use.</span>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs font-semibold underline"
      >
        {expanded ? 'Less' : 'Why this matters'}
      </button>
      <button
        type="button"
        onClick={() => {
          setHidden(true);
          try {
            sessionStorage.setItem('nb-deployer-warning-hidden', '1');
          } catch {
            /* no-op */
          }
        }}
        className="ml-auto text-xs underline"
        style={{ opacity: 0.7 }}
        aria-label="Hide for this session"
      >
        Hide for this session
      </button>

      {expanded && (
        <p className="mt-1 w-full text-xs leading-5">
          This wallet holds <code>OWNER_ROLE</code>, <code>DEFAULT_ADMIN_ROLE</code> and every
          operational role on <code>ProtocolRoles</code>, so its transactions execute instantly
          without passing the timelock. Governance Phase 2 — Stage A (key separation) then Stage B
          (renounce) — must be executed and verified before production use; the runbook is{' '}
          <code>docs/GOVERNANCE_PHASE2.md</code>. Avoid routine operations with this key.
        </p>
      )}
    </div>
  );
}
