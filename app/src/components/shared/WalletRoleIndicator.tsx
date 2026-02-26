'use client';

import { useAccount } from 'wagmi';
import { useAdminAddress } from '@/hooks/useAdminAddress';
import { INSURANCE_COMPANY_WHITELIST, CURATOR_WHITELIST } from '@/app/app/apply/page';

export function WalletRoleIndicator() {
  const { address, isConnected } = useAccount();
  const adminAddress = useAdminAddress();

  if (!isConnected || !address) return null;

  const addr = address.toLowerCase();
  const isAdmin = addr === adminAddress.toLowerCase();
  const isInsurance = INSURANCE_COMPANY_WHITELIST.includes(addr);
  const isCurator = CURATOR_WHITELIST.includes(addr);

  if (isAdmin) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '50px', padding: '3px 10px', fontSize: '11px', fontWeight: 600, fontFamily: "'Inter', sans-serif", background: 'rgba(109,40,217,0.08)', color: '#6D28D9', border: '1px solid rgba(109,40,217,0.2)' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6D28D9' }} />
        Admin
      </span>
    );
  }

  if (isInsurance) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '50px', padding: '3px 10px', fontSize: '11px', fontWeight: 600, fontFamily: "'Inter', sans-serif", background: 'rgba(22,101,52,0.08)', color: '#166534', border: '1px solid rgba(22,101,52,0.2)' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#166534' }} />
        Insurance Co.
      </span>
    );
  }

  if (isCurator) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '50px', padding: '3px 10px', fontSize: '11px', fontWeight: 600, fontFamily: "'Inter', sans-serif", background: 'rgba(146,64,14,0.08)', color: '#92400E', border: '1px solid rgba(201,168,76,0.3)' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C9A84C' }} />
        Curator
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '50px', padding: '3px 10px', fontSize: '11px', fontWeight: 600, fontFamily: "'Inter', sans-serif", background: 'rgba(27,58,107,0.06)', color: '#1B3A6B', border: '1px solid rgba(27,58,107,0.15)' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1B3A6B' }} />
      Investor
    </span>
  );
}
