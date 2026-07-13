'use client';

import Link from 'next/link';
import { useEmailSession } from '@/hooks/useEmailSession';

/**
 * Header email-account control — the standard-site pattern:
 *   signed out → ONE "Sign in" button, linking to the full /auth gateway
 *                (magic link, optional password, self-service registration);
 *   signed in  → account pill with the email and a dropdown (roles, account
 *                management, sign out).
 * No inline credential form in the header: credentials belong to /auth.
 */

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  borderRadius: '999px',
  border: '1px solid rgba(27,58,107,0.16)',
  background: '#FFFFFF',
  color: '#1B3A6B',
  fontFamily: "'Inter', sans-serif",
  fontSize: '12px',
  fontWeight: 600,
  padding: '7px 12px',
};

export function EmailAuthControls() {
  const {
    profile,
    loading,
    profileLoading,
    isEmailAuthenticated,
    isAppAdmin,
    canOperateKyb,
    signOutEmail,
  } = useEmailSession();

  if (loading) {
    return <span style={pillStyle}>…</span>;
  }

  if (isEmailAuthenticated && profile) {
    const roleLabel = isAppAdmin ? 'Admin email' : canOperateKyb ? 'KYB email' : 'Email';
    return (
      <div className="relative group">
        <button type="button" style={pillStyle} aria-label="Email session active">
          <span>{roleLabel}</span>
          <span style={{ color: '#6B7280', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {profile.user.email}
          </span>
        </button>
        <div
          className="absolute right-0 hidden group-hover:block"
          style={{
            top: 'calc(100% + 8px)',
            width: '280px',
            background: '#FFFFFF',
            border: '1px solid #E8E4DC',
            borderRadius: '14px',
            padding: '14px',
            boxShadow: '0 12px 40px rgba(27,58,107,0.16)',
            zIndex: 1000,
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#374151', lineHeight: 1.5 }}>
            Sessione email verificata. Le azioni on-chain continuano a richiedere una firma wallet autorizzata.
          </p>
          <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#6B7280' }}>
            Ruoli: {profile.roles.join(', ') || 'nessuno'}
            {profileLoading ? ' · aggiornamento…' : ''}
          </p>
          <Link
            href="/auth"
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'center',
              border: '1px solid rgba(27,58,107,0.25)',
              background: 'rgba(27,58,107,0.06)',
              borderRadius: '10px',
              padding: '8px 10px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#1B3A6B',
              textDecoration: 'none',
              marginBottom: '8px',
            }}
          >
            Gestisci account / password
          </Link>
          <button
            type="button"
            onClick={() => void signOutEmail()}
            style={{
              width: '100%',
              border: '1px solid #D1D5DB',
              background: '#F9FAFB',
              borderRadius: '10px',
              padding: '8px 10px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#374151',
              cursor: 'pointer',
            }}
          >
            Esci dalla sessione email
          </button>
        </div>
      </div>
    );
  }

  // Signed out: one entry point, every breakpoint — like every other site.
  return (
    <Link href="/auth" style={pillStyle} aria-label="Sign in or register">
      Sign in
    </Link>
  );
}
