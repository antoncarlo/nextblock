'use client';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { getWalletRole } from '@/components/shared/WalletRoleIndicator';
import { useAdminAddress } from '@/hooks/useAdminAddress';
import { getWalletName } from '@/config/knownWallets';
import { useVaultAddresses, useVaultInfo } from '@/hooks/useVaultData';
// ─── Vault card per la compagnia ──────────────────────────────────────────────────
function CompanyVaultCard({ address }: { address: string }) {
  const { data } = useVaultInfo(address as `0x${string}`);
  // getVaultInfo returns: [name, manager, assets, shares, sharePrice, bufferBps, feeBps, availableBuffer, deployedCapital, policyCount]
  const vaultName = data?.[0] as string | undefined;
  const assets = data?.[2] as bigint | undefined;

  const tvl = assets
    ? (Number(assets) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : '—';

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E8E4DC',
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h3 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '18px', fontWeight: 400, color: '#1B3A6B', margin: '0 0 4px' }}>
            {vaultName ?? address.slice(0, 10) + '...'}
          </h3>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#9CA3AF', margin: 0 }}>
            Insurance Vault
          </p>
        </div>
        <span style={{
          padding: '3px 10px', borderRadius: '50px', fontSize: '11px', fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
          background: 'rgba(22,101,52,0.08)', color: '#166534', border: '1px solid rgba(22,101,52,0.2)',
        }}>
          Active
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[
          { label: 'TVL', value: `$${tvl}` },
          { label: 'Policies', value: data?.[9] != null ? String(data[9]) : '—' },
          { label: 'Address', value: address.slice(0, 8) + '...' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#FAFAF8', borderRadius: '8px', padding: '12px' }}>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#9CA3AF', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 600, color: '#1B3A6B', margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
        <Link
          href={`/app/vault/${address}/manage`}
          style={{
            flex: 1, textAlign: 'center', padding: '9px 16px', borderRadius: '8px',
            background: '#1B3A6B', color: '#FFFFFF',
            fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Manage Vault
        </Link>
        <Link
          href={`/app/vault/${address}`}
          style={{
            flex: 1, textAlign: 'center', padding: '9px 16px', borderRadius: '8px',
            background: 'transparent', color: '#1B3A6B',
            border: '1px solid rgba(27,58,107,0.2)',
            fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          View Public Page
        </Link>
      </div>
    </div>
  );
}

// ─── Pagina principale ────────────────────────────────────────────────────────
export default function MyCompanyPage() {
  const { address, isConnected } = useAccount();
  const adminAddress = useAdminAddress();
  const role = getWalletRole(address, adminAddress);
  const userName = getWalletName(address);
  const { data: vaultAddresses } = useVaultAddresses();

  if (!isConnected) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAF8' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '40px' }}>
          <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '28px', fontWeight: 400, color: '#1B3A6B', marginBottom: '12px' }}>
            Connect Your Wallet
          </h2>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '15px', color: '#6B7280', lineHeight: 1.6 }}>
            Connect your approved Insurance Company wallet to access your company dashboard.
          </p>
        </div>
      </div>
    );
  }

  if (role !== 'insurance' && role !== 'admin') {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAF8' }}>
        <div style={{ textAlign: 'center', maxWidth: '480px', padding: '40px' }}>
          <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '28px', fontWeight: 400, color: '#1B3A6B', marginBottom: '12px' }}>
            Insurance Company Access Required
          </h2>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '15px', color: '#6B7280', lineHeight: 1.6, marginBottom: '28px' }}>
            This section is reserved for approved Insurance Companies. Apply to list your insurance portfolio on NextBlock.
          </p>
          <Link
            href="/app/apply"
            style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: '8px',
              background: '#1B3A6B', color: '#FFFFFF',
              fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Apply as Insurance Company
          </Link>
        </div>
      </div>
    );
  }

  const displayName = userName ?? 'Insurance Company';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8' }}>
      {/* Hero banner */}
      <div
        style={{
          position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, #0F2444 0%, #1B3A6B 60%, #2C5282 100%)',
          padding: '64px 40px',
        }}
      >
        <div
          style={{
            position: 'absolute', inset: 0, opacity: 0.06,
            backgroundImage: 'url(/assets/ships-illustration.jpg)',
            backgroundSize: 'cover', backgroundPosition: 'center',
          }}
        />
        <div style={{ position: 'relative', maxWidth: '1200px', margin: '0 auto' }}>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 600, color: 'rgba(201,168,76,0.9)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Insurance Company Portal
          </p>
          <h1 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '38px', fontWeight: 400, color: '#FFFFFF', marginBottom: '10px', lineHeight: 1.2 }}>
            Welcome back, {displayName}
          </h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '16px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, maxWidth: '560px', marginBottom: '32px' }}>
            Tokenize your insurance portfolio, create vaults, register policies and manage your capital on-chain.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link href="/app/create-vault" style={{ padding: '12px 24px', borderRadius: '8px', background: '#C9A84C', color: '#1B3A6B', fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 700, textDecoration: 'none' }}>
              Create New Vault
            </Link>
            <Link href="/app/apply" style={{ padding: '12px 24px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.2)', fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>
              Company Profile
            </Link>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 32px 0' }}>
        <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '22px', fontWeight: 400, color: '#1B3A6B', marginBottom: '20px' }}>
          Quick Actions
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '48px' }}>
          {[
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
              ),
              title: 'Create Vault',
              desc: 'Deploy a new ERC-4626 insurance vault',
              href: '/app/create-vault',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5">
                  <path d="M9 12h6M9 16h6M9 8h6M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
                </svg>
              ),
              title: 'Register Policy',
              desc: 'Tokenize a new insurance policy on-chain',
              href: `/app/vault/${vaultAddresses?.[0] ?? '0xF725B7E9176F1F2D0B9b3D0e3E5e1b1C5e2D3A4B'}/manage`,
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 6v6l4 2" />
                </svg>
              ),
              title: 'Deposit Premium',
              desc: 'Fund your active policies with USDC',
              href: `/app/vault/${vaultAddresses?.[0] ?? '0xF725B7E9176F1F2D0B9b3D0e3E5e1b1C5e2D3A4B'}/manage`,
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5">
                  <path d="M3 3v18h18" />
                  <path d="M7 16l4-4 4 4 4-4" />
                </svg>
              ),
              title: 'View Analytics',
              desc: 'Monitor your portfolio performance',
              href: '/app',
            },
          ].map(({ icon, title, desc, href }) => (
            <Link
              key={title}
              href={href}
              style={{
                display: 'block', textDecoration: 'none',
                background: '#FFFFFF', border: '1px solid #E8E4DC',
                borderRadius: '12px', padding: '20px',
                transition: 'box-shadow 0.2s, border-color 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(27,58,107,0.3)';
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 4px 16px rgba(27,58,107,0.1)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = '#E8E4DC';
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = 'none';
              }}
            >
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(27,58,107,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                {icon}
              </div>
              <p style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '15px', fontWeight: 400, color: '#1B3A6B', margin: '0 0 6px' }}>{title}</p>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#9CA3AF', margin: 0, lineHeight: 1.5 }}>{desc}</p>
            </Link>
          ))}
        </div>

        {/* My Vaults */}
        <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '22px', fontWeight: 400, color: '#1B3A6B', marginBottom: '8px' }}>
          My Vaults
        </h2>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', color: '#6B7280', marginBottom: '24px' }}>
          Insurance vaults you manage on NextBlock
        </p>

        {vaultAddresses && vaultAddresses.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', marginBottom: '48px' }}>
            {vaultAddresses.slice(0, 4).map((addr) => (
              <CompanyVaultCard key={addr} address={addr} />
            ))}
          </div>
        ) : (
          <div style={{
            background: '#FFFFFF', border: '1px dashed #D1C9B8', borderRadius: '12px',
            padding: '48px', textAlign: 'center', marginBottom: '48px',
          }}>
            <p style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '20px', fontWeight: 400, color: '#1B3A6B', marginBottom: '8px' }}>
              No vaults yet
            </p>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', color: '#9CA3AF', marginBottom: '24px' }}>
              Create your first insurance vault to start tokenizing your portfolio.
            </p>
            <Link
              href="/app/create-vault"
              style={{
                display: 'inline-block', padding: '12px 28px', borderRadius: '8px',
                background: '#1B3A6B', color: '#FFFFFF',
                fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Create Your First Vault
            </Link>
          </div>
        )}

        {/* Risk disclosures */}
        <div style={{ borderTop: '1px solid #E8E4DC', paddingTop: '32px', paddingBottom: '48px' }}>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#9CA3AF', lineHeight: 1.7, maxWidth: '800px' }}>
            <strong style={{ color: '#6B7280' }}>Risk Disclosure:</strong> Insurance vaults on NextBlock involve smart contract risk, liquidity risk, and underwriting risk. Past performance of insurance portfolios is not indicative of future results. All on-chain transactions are irreversible. Ensure you understand the protocol mechanics before deploying capital.
          </p>
        </div>
      </div>
    </div>
  );
}
