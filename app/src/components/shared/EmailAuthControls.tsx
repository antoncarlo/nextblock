'use client';

import { FormEvent, useState } from 'react';
import { useEmailSession } from '@/hooks/useEmailSession';

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
    error,
    isEmailAuthenticated,
    isAppAdmin,
    canOperateKyb,
    signInWithEmail,
    signOutEmail,
  } = useEmailSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [lastMode, setLastMode] = useState<'password' | 'magic_link' | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    const result = await signInWithEmail(email, password);
    setSubmitting(false);
    if (!result.ok) {
      setLocalError(result.error ?? 'Impossibile completare l’accesso email.');
      return;
    }
    setSent(true);
    setLastMode(result.mode ?? (password ? 'password' : 'magic_link'));
    if (result.mode === 'password') {
      setPassword('');
    }
  }

  if (loading) {
    return <span style={pillStyle}>Email…</span>;
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

  return (
    <form onSubmit={handleSubmit} className="hidden lg:flex items-center gap-2" style={{ position: 'relative' }}>
      <input
        type="email"
        value={email}
        onChange={event => setEmail(event.target.value)}
        placeholder="Email admin"
        aria-label="Email admin"
        style={{
          width: '170px',
          border: '1px solid rgba(27,58,107,0.16)',
          borderRadius: '999px',
          padding: '8px 12px',
          fontSize: '12px',
          color: '#111827',
          background: '#FFFFFF',
          outline: 'none',
        }}
      />
      <input
        type="password"
        value={password}
        onChange={event => setPassword(event.target.value)}
        placeholder="Password opz."
        aria-label="Password admin opzionale"
        autoComplete="current-password"
        style={{
          width: '125px',
          border: '1px solid rgba(27,58,107,0.16)',
          borderRadius: '999px',
          padding: '8px 12px',
          fontSize: '12px',
          color: '#111827',
          background: '#FFFFFF',
          outline: 'none',
        }}
      />
      <button
        type="submit"
        disabled={submitting}
        style={{
          border: 'none',
          borderRadius: '999px',
          padding: '8px 12px',
          fontSize: '12px',
          fontWeight: 700,
          color: '#FFFFFF',
          background: submitting ? '#94A3B8' : '#1B3A6B',
          cursor: submitting ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {submitting ? 'Invio…' : 'Entra'}
      </button>
      {(sent || localError || error) && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: '260px',
            background: '#FFFFFF',
            border: '1px solid #E8E4DC',
            borderRadius: '12px',
            padding: '10px 12px',
            boxShadow: '0 10px 32px rgba(27,58,107,0.14)',
            fontSize: '12px',
            lineHeight: 1.5,
            color: localError || error ? '#991B1B' : '#166534',
            zIndex: 1000,
          }}
        >
          {localError || error || (lastMode === 'password' ? 'Accesso email completato.' : 'Magic link inviato. Controlla la casella email.')}
        </div>
      )}
    </form>
  );
}
