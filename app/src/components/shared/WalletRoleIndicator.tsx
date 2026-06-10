'use client';
import { useState, createContext, useContext } from 'react';
import { useAccount } from 'wagmi';
import { useProtocolAccess, ProtocolAccessStatus } from '@/hooks/useProtocolAccess';
import { useAdminAddress } from '@/hooks/useAdminAddress';

export type AppRole = 'admin' | 'insurance' | 'syndicate' | 'investor' | 'none';

// ─── Global context for the active view role (manual override) ───────────────
const ActiveRoleContext = createContext<{
  activeRole: AppRole | null;
  setActiveRole: (r: AppRole | null) => void;
}>({ activeRole: null, setActiveRole: () => {} });

export function useActiveRole() {
  return useContext(ActiveRoleContext);
}

export function ActiveRoleProvider({ children }: { children: React.ReactNode }) {
  const [activeRole, setActiveRole] = useState<AppRole | null>(null);
  return (
    <ActiveRoleContext.Provider value={{ activeRole, setActiveRole }}>
      {children}
    </ActiveRoleContext.Provider>
  );
}

/**
 * ON-CHAIN role resolution (Phase 9): roles come exclusively from
 * ProtocolRoles + ComplianceRegistry. No frontend whitelist is consulted.
 *
 * When the institutional contracts are not deployed on the active chain the
 * status is 'unavailable': the UI shows that state explicitly instead of
 * inventing access. The only legacy path kept is the chain admin address
 * (read on-chain via useAdminAddress) so legacy demo deployments remain
 * administrable; it is labelled as such.
 */
export function useWalletRole(): {
  role: AppRole;
  status: ProtocolAccessStatus;
  flags: ReturnType<typeof useProtocolAccess>;
} {
  const { address, isConnected } = useAccount();
  const access = useProtocolAccess();
  const adminAddress = useAdminAddress();

  if (!isConnected || !address) return { role: 'none', status: 'disconnected', flags: access };

  // Legacy demo chains (institutional stack not deployed): only the on-chain
  // legacy admin is recognised; everyone else is an unverified visitor.
  if (access.status === 'unavailable') {
    const isLegacyAdmin = address.toLowerCase() === adminAddress.toLowerCase();
    return { role: isLegacyAdmin ? 'admin' : 'none', status: 'unavailable', flags: access };
  }

  if (access.isOwner || access.isSentinel) return { role: 'admin', status: access.status, flags: access };
  if (access.isCedant) return { role: 'insurance', status: access.status, flags: access };
  if (access.isCurator || access.isAllocator) return { role: 'syndicate', status: access.status, flags: access };
  if (access.isCompliantLP) return { role: 'investor', status: access.status, flags: access };
  // Connected, contracts deployed, but no role and no KYC: no access invented.
  return { role: 'none', status: access.status, flags: access };
}

// Available view roles for a wallet, derived from its ON-CHAIN flags only.
function getAvailableRoles(flags: ReturnType<typeof useProtocolAccess>, baseRole: AppRole): AppRole[] {
  if (baseRole === 'admin') return ['admin', 'insurance', 'syndicate', 'investor'];
  const roles: AppRole[] = [];
  if (flags.isCedant) roles.push('insurance');
  if (flags.isCurator || flags.isAllocator) roles.push('syndicate');
  if (flags.isCompliantLP) roles.push('investor');
  if (roles.length === 0 && baseRole !== 'none') roles.push(baseRole);
  return roles;
}

const ROLE_CONFIG: Record<Exclude<AppRole, 'none'>, {
  label: string; dot: string; bg: string; color: string; border: string;
}> = {
  admin:     { label: 'Admin / Sentinel',      dot: '#6D28D9', bg: 'rgba(109,40,217,0.08)',  color: '#6D28D9', border: 'rgba(109,40,217,0.2)' },
  insurance: { label: 'Cedant / Reinsurer',    dot: '#166534', bg: 'rgba(22,101,52,0.08)',   color: '#166534', border: 'rgba(22,101,52,0.2)' },
  syndicate: { label: 'Underwriting Curator',  dot: '#C9A84C', bg: 'rgba(146,64,14,0.08)',   color: '#92400E', border: 'rgba(201,168,76,0.3)' },
  investor:  { label: 'Institutional LP',      dot: '#1B3A6B', bg: 'rgba(27,58,107,0.06)',   color: '#1B3A6B', border: 'rgba(27,58,107,0.15)' },
};

export function WalletRoleIndicator() {
  const { isConnected, address } = useAccount();
  const { activeRole, setActiveRole } = useActiveRole();
  const { role: baseRole, status, flags } = useWalletRole();
  const [open, setOpen] = useState(false);

  if (!isConnected || !address) return null;

  // Institutional stack not deployed on this chain: say so, never fake a role.
  if (status === 'unavailable' && baseRole === 'none') {
    return (
      <span
        title="ProtocolRoles / ComplianceRegistry are not deployed on this network. On-chain role resolution is unavailable."
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          borderRadius: '50px', padding: '3px 10px',
          fontSize: '11px', fontWeight: 600, fontFamily: "'Inter', sans-serif",
          background: 'rgba(127,29,29,0.06)', color: '#7F1D1D', border: '1px solid rgba(127,29,29,0.2)',
          userSelect: 'none',
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7F1D1D' }} />
        Roles unavailable
      </span>
    );
  }

  if (baseRole === 'none' || status === 'loading') return null;

  const displayRole = activeRole ?? baseRole;
  const availableRoles = getAvailableRoles(flags, baseRole).filter(r => r !== 'none');
  const cfg = ROLE_CONFIG[displayRole as Exclude<AppRole, 'none'>];

  // Single role available: static badge only.
  if (availableRoles.length <= 1) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        borderRadius: '50px', padding: '3px 10px',
        fontSize: '11px', fontWeight: 600, fontFamily: "'Inter', sans-serif",
        background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
        userSelect: 'none',
      }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cfg.dot }} />
        {cfg.label}
      </span>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          borderRadius: '50px', padding: '3px 10px',
          fontSize: '11px', fontWeight: 600, fontFamily: "'Inter', sans-serif",
          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
          cursor: 'pointer', userSelect: 'none',
          transition: 'opacity 0.15s',
        }}
        aria-label="Switch view role"
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cfg.dot }} />
        {cfg.label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.6, marginLeft: '2px', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 999,
            backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC',
            borderRadius: '12px', padding: '6px', minWidth: '200px',
            boxShadow: '0 8px 32px rgba(27,58,107,0.14)',
          }}>
            <p style={{ fontSize: '10px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 8px', margin: 0, fontFamily: "'Inter', sans-serif" }}>
              Switch View
            </p>
            {availableRoles.map((r) => {
              const rc = ROLE_CONFIG[r as Exclude<AppRole, 'none'>];
              const isActive = displayRole === r;
              return (
                <button
                  key={r}
                  onClick={() => { setActiveRole(r === baseRole ? null : r); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                    padding: '8px 10px', borderRadius: '8px', border: 'none',
                    background: isActive ? rc.bg : 'transparent',
                    color: rc.color, fontSize: '12px', fontWeight: 600,
                    fontFamily: "'Inter', sans-serif", cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: rc.dot }} />
                  {rc.label}
                  {isActive && <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.7 }}>Active</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
