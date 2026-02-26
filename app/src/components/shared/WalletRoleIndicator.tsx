'use client';
import { useState, createContext, useContext } from 'react';
import { useAccount } from 'wagmi';
import { useAdminAddress } from '@/hooks/useAdminAddress';
import { INSURANCE_COMPANY_WHITELIST, CURATOR_WHITELIST } from '@/app/app/apply/page';

export type AppRole = 'admin' | 'insurance' | 'syndicate' | 'investor' | 'none';

// ─── Contesto globale per il ruolo attivo (override manuale) ──────────────────
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

export function getWalletRole(
  address: string | undefined,
  adminAddress: string
): AppRole {
  if (!address) return 'none';
  const addr = address.toLowerCase();
  if (addr === adminAddress.toLowerCase()) return 'admin';
  if (INSURANCE_COMPANY_WHITELIST.map(a => a.toLowerCase()).includes(addr)) return 'insurance';
  if (CURATOR_WHITELIST.map(a => a.toLowerCase()).includes(addr)) return 'syndicate';
  return 'investor';
}

// Ruoli disponibili per un dato wallet
function getAvailableRoles(baseRole: AppRole): AppRole[] {
  if (baseRole === 'admin') return ['admin', 'insurance', 'syndicate', 'investor'];
  if (baseRole === 'insurance' && CURATOR_WHITELIST.length > 0) {
    // se il wallet è anche in CURATOR_WHITELIST, mostra entrambi
    return ['insurance', 'syndicate', 'investor'];
  }
  if (baseRole === 'insurance') return ['insurance', 'investor'];
  if (baseRole === 'syndicate') return ['syndicate', 'investor'];
  return ['investor'];
}

const ROLE_CONFIG: Record<Exclude<AppRole, 'none'>, {
  label: string; dot: string; bg: string; color: string; border: string;
}> = {
  admin:     { label: 'Admin',             dot: '#6D28D9', bg: 'rgba(109,40,217,0.08)',  color: '#6D28D9', border: 'rgba(109,40,217,0.2)' },
  insurance: { label: 'Insurance Co.',     dot: '#166534', bg: 'rgba(22,101,52,0.08)',   color: '#166534', border: 'rgba(22,101,52,0.2)' },
  syndicate: { label: 'Syndicate Manager', dot: '#C9A84C', bg: 'rgba(146,64,14,0.08)',   color: '#92400E', border: 'rgba(201,168,76,0.3)' },
  investor:  { label: 'Investor',          dot: '#1B3A6B', bg: 'rgba(27,58,107,0.06)',   color: '#1B3A6B', border: 'rgba(27,58,107,0.15)' },
};

export function WalletRoleIndicator() {
  const { address, isConnected } = useAccount();
  const adminAddress = useAdminAddress();
  const { activeRole, setActiveRole } = useActiveRole();
  const [open, setOpen] = useState(false);

  if (!isConnected || !address) return null;

  const baseRole = getWalletRole(address, adminAddress);
  if (baseRole === 'none') return null;

  const displayRole = activeRole ?? baseRole;
  const availableRoles = getAvailableRoles(baseRole).filter(r => r !== 'none');
  const cfg = ROLE_CONFIG[displayRole as Exclude<AppRole, 'none'>];

  // Se c'è un solo ruolo disponibile, mostra solo il badge statico
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
      {/* Badge cliccabile */}
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
        {/* Chevron */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.6, marginLeft: '2px', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Dropdown */}
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
            {availableRoles.map(r => {
              const c = ROLE_CONFIG[r as Exclude<AppRole, 'none'>];
              const isActive = displayRole === r;
              return (
                <button
                  key={r}
                  onClick={() => { setActiveRole(r); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                    padding: '8px 10px', borderRadius: '8px', border: 'none',
                    background: isActive ? c.bg : 'transparent',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', fontWeight: isActive ? 700 : 500, color: isActive ? c.color : '#374151', fontFamily: "'Inter', sans-serif" }}>
                    {c.label}
                  </span>
                  {isActive && (
                    <svg style={{ marginLeft: 'auto' }} width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke={c.dot} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
