'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { WalletButton } from './WalletButton';
import { WalletRoleIndicator, getWalletRole } from './WalletRoleIndicator';
import { useAdminAddress } from '@/hooks/useAdminAddress';

const navLinkStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 18px',
  borderRadius: '50px',
  fontSize: '13px',
  fontWeight: active ? 600 : 500,
  fontFamily: "'Inter', sans-serif",
  color: active ? '#1B3A6B' : '#6B7280',
  textDecoration: 'none',
  letterSpacing: '0.01em',
  transition: 'background 0.2s',
  backgroundColor: active ? 'rgba(27,58,107,0.08)' : 'transparent',
});

const ctaLinkStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 18px',
  borderRadius: '50px',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: "'Inter', sans-serif",
  color: '#1B3A6B',
  textDecoration: 'none',
  letterSpacing: '0.01em',
  transition: 'background 0.2s',
  backgroundColor: active ? 'rgba(27,58,107,0.12)' : 'rgba(27,58,107,0.06)',
  border: '1px solid rgba(27,58,107,0.12)',
});

export function Header() {
  const { address, isConnected } = useAccount();
  const adminAddress = useAdminAddress();
  const pathname = usePathname();
  const [showSyndicateInfo, setShowSyndicateInfo] = useState(false);

  const role = getWalletRole(address, adminAddress);

  // ─── Navigazione per ruolo ──────────────────────────────────────────────
  // Wallet non connesso o Investor: solo Vaults
  // Insurance Company: Vaults + My Company + Create Vault
  // Syndicate Manager: Vaults + Syndicates + Syndicate Dashboard + Create Vault
  // Admin: tutto

  const showVaults = true; // sempre visibile
  const showSyndicates = role === 'syndicate' || role === 'admin';
  const showSyndicateDashboard = role === 'syndicate' || role === 'admin';
  const showMyCompany = role === 'insurance' || role === 'admin';
  const showCreateVault = role === 'insurance' || role === 'syndicate' || role === 'admin';
  const showApply = !isConnected || role === 'investor'; // visibile solo se non connesso o investor
  const showAdmin = role === 'admin';

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: 'rgba(250, 250, 248, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <div
        className="mx-auto flex items-center justify-between"
        style={{ maxWidth: '1280px', padding: '0 32px', height: '80px' }}
      >
        {/* Logo */}
        <Link href="/app" className="flex items-center" style={{ textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logo-black.svg"
            alt="NextBlock"
            style={{ height: '160px', width: 'auto' }}
          />
        </Link>

        {/* Nav pill — center */}
        <nav
          className="hidden sm:flex items-center gap-1"
          style={{
            background: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: '50px',
            padding: '4px 6px',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Vaults — sempre visibile */}
          {showVaults && (
            <Link
              href="/app"
              style={navLinkStyle(pathname === '/app')}
              className="hover:bg-black/5"
            >
              Vaults
            </Link>
          )}

          {/* Syndicates — solo per Syndicate Manager e Admin */}
          {showSyndicates && (
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '6px 12px 6px 18px',
                  borderRadius: '50px',
                  backgroundColor: pathname?.startsWith('/app/syndicates') ? 'rgba(27,58,107,0.08)' : 'transparent',
                  transition: 'background 0.2s',
                }}
              >
                <Link
                  href="/app/syndicates"
                  style={{
                    fontSize: '13px',
                    fontWeight: pathname?.startsWith('/app/syndicates') ? 600 : 500,
                    fontFamily: "'Inter', sans-serif",
                    color: pathname?.startsWith('/app/syndicates') ? '#1B3A6B' : '#6B7280',
                    textDecoration: 'none',
                    letterSpacing: '0.01em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Syndicates
                </Link>
              <button
                onClick={() => setShowSyndicateInfo(!showSyndicateInfo)}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '16px', height: '16px', borderRadius: '50%',
                  border: '1.5px solid #9CA3AF', backgroundColor: 'transparent',
                  color: '#9CA3AF', fontSize: '10px', fontWeight: 700,
                  cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0,
                  transition: 'border-color 0.2s, color 0.2s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#1B3A6B';
                  (e.currentTarget as HTMLButtonElement).style.color = '#1B3A6B';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#9CA3AF';
                  (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF';
                }}
                aria-label="What is a Syndicate?"
              >
                i
              </button>
              </div>
              {/* Info popup */}
              {showSyndicateInfo && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                    onClick={() => setShowSyndicateInfo(false)}
                  />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 16px)', left: '50%',
                    transform: 'translateX(-50%)', zIndex: 999,
                    backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC',
                    borderRadius: '14px', padding: '22px 26px', width: '360px',
                    boxShadow: '0 12px 40px rgba(27,58,107,0.16)',
                  }}>
                    <div style={{ position: 'absolute', top: '-7px', left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: '12px', height: '12px', backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderBottom: 'none', borderRight: 'none' }} />
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <h4 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '17px', fontWeight: 700, color: '#1B3A6B', margin: 0, lineHeight: 1.3 }}>
                        What is a Syndicate?
                      </h4>
                      <button onClick={() => setShowSyndicateInfo(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '18px', padding: '0 0 0 10px', lineHeight: 1, flexShrink: 0 }}>×</button>
                    </div>
                    <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.65', margin: '0 0 12px' }}>
                      On NextBlock, <strong>Syndicates</strong> are what we call <strong>Vault Curators</strong> — the licensed reinsurers, insurers, and asset managers who deploy and manage insurance vaults on the protocol.
                    </p>
                    <ul style={{ fontSize: '13px', color: '#374151', lineHeight: '1.75', margin: '0 0 16px', paddingLeft: '18px' }}>
                      <li>Deploys an <strong>ERC-4626 vault</strong> with a defined insurance strategy</li>
                      <li>Registers and manages <strong>tokenized insurance policies</strong></li>
                      <li>Sets <strong>risk parameters</strong>: buffer ratio, fees, verification paths</li>
                      <li>Attracts <strong>USDC liquidity</strong> from investors seeking insurance yield</li>
                    </ul>
                    <div style={{ backgroundColor: '#F0F4FF', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#1D4ED8', lineHeight: '1.6' }}>
                      <strong>KYC required.</strong> Only entities approved by NextBlock after identity and regulatory verification may operate as Syndicate Managers.
                    </div>
                    <div style={{ borderTop: '1px solid #F0EDE8', paddingTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                      <Link href="/app/syndicates" onClick={() => setShowSyndicateInfo(false)} style={{ fontSize: '12px', fontWeight: 600, color: '#1B3A6B', textDecoration: 'none' }}>
                        View all Syndicates →
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Syndicate Dashboard — solo per Syndicate Manager e Admin */}
          {showSyndicateDashboard && (
            <Link
              href="/app/syndicates/dashboard"
              style={navLinkStyle(pathname?.startsWith('/app/syndicates/dashboard') ?? false)}
              className="hover:bg-black/5"
            >
              My Dashboard
            </Link>
          )}

          {/* My Company — solo per Insurance Company e Admin */}
          {showMyCompany && (
            <Link
              href="/app/my-company"
              style={navLinkStyle(pathname?.startsWith('/app/my-company') ?? false)}
              className="hover:bg-black/5"
            >
              My Company
            </Link>
          )}

          {/* Apply — solo per non connessi o investor */}
          {showApply && (
            <Link
              href="/app/apply"
              style={navLinkStyle(pathname?.startsWith('/app/apply') ?? false)}
              className="hover:bg-black/5"
            >
              Apply
            </Link>
          )}

          {/* Create Vault — solo per Insurance Co., Syndicate Manager e Admin */}
          {showCreateVault && (
            <Link
              href="/app/create-vault"
              style={ctaLinkStyle(pathname?.startsWith('/app/create-vault') ?? false)}
              className="hover:bg-black/5"
            >
              Create Vault
            </Link>
          )}

          {/* Admin — solo per Admin */}
          {showAdmin && (
            <Link
              href="/app/admin"
              style={navLinkStyle(pathname?.startsWith('/app/admin') ?? false)}
              className="hover:bg-black/5"
            >
              Admin
            </Link>
          )}
        </nav>

        {/* Wallet */}
        <div className="flex items-center gap-3">
          <WalletRoleIndicator />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
