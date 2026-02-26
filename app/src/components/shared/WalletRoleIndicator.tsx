'use client';
import { useAccount } from 'wagmi';
import { useAdminAddress } from '@/hooks/useAdminAddress';
import { INSURANCE_COMPANY_WHITELIST, CURATOR_WHITELIST } from '@/app/app/apply/page';

export type AppRole = 'admin' | 'insurance' | 'syndicate' | 'investor' | 'none';

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

  if (!isConnected || !address) return null;

  const role = getWalletRole(address, adminAddress);
  if (role === 'none') return null;

  const cfg = ROLE_CONFIG[role];
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
