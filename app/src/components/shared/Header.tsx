'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { WalletButton } from './WalletButton';
import { WalletRoleIndicator } from './WalletRoleIndicator';
import { useAdminAddress } from '@/hooks/useAdminAddress';
import { INSURANCE_COMPANY_WHITELIST, CURATOR_WHITELIST } from '@/app/app/apply/page';

// Combined KYC whitelist — insurance companies + curators
const KYC_WHITELIST: string[] = [
  ...INSURANCE_COMPANY_WHITELIST,
  ...CURATOR_WHITELIST,
];

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

export function Header() {
  const { address, isConnected } = useAccount();
  const adminAddress = useAdminAddress();
  const pathname = usePathname();

  const isAdmin =
    isConnected &&
    address?.toLowerCase() === adminAddress.toLowerCase();

  const isKycApproved =
    isConnected && address
      ? KYC_WHITELIST.map(a => a.toLowerCase()).includes(address.toLowerCase())
      : false;

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
            style={navLinkStyle(pathname === '/app')}
            className="hover:bg-black/5"
          >
            Vaults
          </Link>

          <Link
            href="/app/curators"
            style={navLinkStyle(pathname?.startsWith('/app/curators') ?? false)}
            className="hover:bg-black/5"
          >
            Curators
          </Link>

          <Link
            href="/app/apply"
            style={navLinkStyle(pathname?.startsWith('/app/apply') ?? false)}
            className="hover:bg-black/5"
          >
            Apply
          </Link>

          {/* Create Vault — visible only to KYC-approved wallets */}
          {isKycApproved && (
            <Link
              href="/app/create-vault"
              style={{
                ...navLinkStyle(pathname?.startsWith('/app/create-vault') ?? false),
                backgroundColor:
                  pathname?.startsWith('/app/create-vault')
                    ? 'rgba(27,58,107,0.08)'
                    : 'rgba(27,58,107,0.06)',
                color: '#1B3A6B',
              }}
              className="hover:bg-black/5"
            >
              + Create Vault
            </Link>
          )}

          {isAdmin && (
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
