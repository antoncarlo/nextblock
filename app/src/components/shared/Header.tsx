'use client';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { WalletButton } from './WalletButton';
import { WalletRoleIndicator } from './WalletRoleIndicator';
import { useAdminAddress } from '@/hooks/useAdminAddress';

export function Header() {
  const { address, isConnected } = useAccount();
  const adminAddress = useAdminAddress();
  const isAdmin =
    isConnected &&
    address?.toLowerCase() === adminAddress.toLowerCase();

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
          <Link
            href="/app"
            style={{
              padding: '6px 18px',
              borderRadius: '50px',
              fontSize: '13px',
              fontWeight: 500,
              fontFamily: "'Inter', sans-serif",
              color: '#1B3A6B',
              textDecoration: 'none',
              letterSpacing: '0.01em',
              transition: 'background 0.2s',
            }}
            className="hover:bg-black/5"
          >
            Vaults
          </Link>
          {isAdmin && (
            <Link
              href="/app/admin"
              style={{
                padding: '6px 18px',
                borderRadius: '50px',
                fontSize: '13px',
                fontWeight: 500,
                fontFamily: "'Inter', sans-serif",
                color: '#6B7280',
                textDecoration: 'none',
                letterSpacing: '0.01em',
                transition: 'background 0.2s',
              }}
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
