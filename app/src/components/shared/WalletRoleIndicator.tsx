'use client';
import { useState, useRef, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useAdminAddress } from '@/hooks/useAdminAddress';
import { INSURANCE_COMPANY_WHITELIST, CURATOR_WHITELIST } from '@/app/app/apply/page';
import { ChevronDown } from 'lucide-react';

export type AppRole = 'admin' | 'insurance' | 'syndicate' | 'investor';

// Singleton per condividere il ruolo attivo tra componenti senza context provider
let globalRole: AppRole | null = null;
const listeners: Array<(r: AppRole) => void> = [];
export function getActiveRole(): AppRole | null { return globalRole; }
export function setActiveRole(r: AppRole) {
  globalRole = r;
  listeners.forEach(fn => fn(r));
}
export function useActiveRole(): [AppRole | null, (r: AppRole) => void] {
  const [role, setRole] = useState<AppRole | null>(globalRole);
  useEffect(() => {
    const fn = (r: AppRole) => setRole(r);
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1); };
  }, []);
  return [role, setActiveRole];
}

const ROLE_CONFIG: Record<AppRole, { label: string; dot: string; bg: string; color: string; border: string }> = {
  admin:     { label: 'Admin',             dot: '#6D28D9', bg: 'rgba(109,40,217,0.08)',  color: '#6D28D9', border: 'rgba(109,40,217,0.2)' },
  insurance: { label: 'Insurance Co.',     dot: '#166534', bg: 'rgba(22,101,52,0.08)',   color: '#166534', border: 'rgba(22,101,52,0.2)' },
  syndicate: { label: 'Syndicate Manager', dot: '#C9A84C', bg: 'rgba(146,64,14,0.08)',   color: '#92400E', border: 'rgba(201,168,76,0.3)' },
  investor:  { label: 'Investor',          dot: '#1B3A6B', bg: 'rgba(27,58,107,0.06)',   color: '#1B3A6B', border: 'rgba(27,58,107,0.15)' },
};

export function WalletRoleIndicator() {
  const { address, isConnected } = useAccount();
  const adminAddress = useAdminAddress();
  const [activeRole, setRole] = useActiveRole();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const getNaturalRole = (): AppRole => {
    if (!address) return 'investor';
    const addr = address.toLowerCase();
    if (addr === adminAddress.toLowerCase()) return 'admin';
    if (INSURANCE_COMPANY_WHITELIST.includes(addr)) return 'insurance';
    if (CURATOR_WHITELIST.includes(addr)) return 'syndicate';
    return 'investor';
  };

  useEffect(() => {
    if (isConnected && address) {
      setActiveRole(getNaturalRole());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!isConnected || !address || !activeRole) return null;

  const current = ROLE_CONFIG[activeRole];
  const naturalRole = getNaturalRole();

  // Admin non puo cambiare ruolo
  if (naturalRole === 'admin') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '50px', padding: '3px 10px', fontSize: '11px', fontWeight: 600, fontFamily: "'Inter', sans-serif", background: current.bg, color: current.color, border: `1px solid ${current.border}` }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: current.dot }} />
        {current.label}
      </span>
    );
  }

  const availableRoles: AppRole[] = ['insurance', 'syndicate', 'investor'];

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          borderRadius: '50px', padding: '3px 8px 3px 10px',
          fontSize: '11px', fontWeight: 600, fontFamily: "'Inter', sans-serif",
          background: current.bg, color: current.color,
          border: `1px solid ${current.border}`,
          cursor: 'pointer', outline: 'none',
        }}
        title="Switch view role"
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: current.dot, flexShrink: 0 }} />
        {current.label}
        <ChevronDown size={11} style={{ opacity: 0.6, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: '#FFFFFF', border: '1px solid #E8E4DC',
          borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
          minWidth: '210px', zIndex: 9999, overflow: 'hidden',
          fontFamily: "'Inter', sans-serif",
        }}>
          <div style={{ padding: '8px 12px 6px', fontSize: '10px', fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid #F3F4F6' }}>
            View as role
          </div>
          {availableRoles.map(r => {
            const cfg = ROLE_CONFIG[r];
            const isActive = r === activeRole;
            return (
              <button
                key={r}
                onClick={() => { setRole(r); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '9px 14px',
                  background: isActive ? 'rgba(27,58,107,0.04)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: isActive ? 600 : 400, color: isActive ? '#1B3A6B' : '#374151' }}>
                  {cfg.label}
                </span>
                {isActive && (
                  <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#9CA3AF', fontWeight: 500 }}>active</span>
                )}
              </button>
            );
          })}
          <div style={{ padding: '6px 12px 8px', borderTop: '1px solid #F3F4F6', fontSize: '10px', color: '#9CA3AF', lineHeight: 1.4 }}>
            Switch view to explore different role features
          </div>
        </div>
      )}
    </div>
  );
}
