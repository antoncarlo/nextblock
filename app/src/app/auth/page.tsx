'use client';
import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEmailSession } from '@/hooks/useEmailSession';
import { supabase } from '@/integrations/supabase/client';

/**
 * Email sign-in / registration gateway.
 *
 * Magic link by default (a NEW address becomes an account on the first
 * link — self-service registration); password sign-in for accounts that set
 * one. The email identity carries ZERO protocol privileges by itself:
 * admin/KYB roles are granted server-side only, and on-chain actions always
 * require an authorized wallet signature. Redirect target comes from
 * ?redirect= (default /app).
 */

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid #E5E7EB',
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  color: '#0F1218',
  background: '#FFFFFF',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#6B7280',
  marginBottom: 6,
};

function AuthPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/app';
  const { isEmailAuthenticated, profile, signInWithEmail } = useEmailSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function handleSetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setPasswordError('La password deve avere almeno 8 caratteri.');
      return;
    }
    setSavingPassword(true);
    setPasswordError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (updateError) {
      setPasswordError(updateError.message);
      return;
    }
    setPasswordSaved(true);
    setNewPassword('');
  }

  if (isEmailAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div className="card-institutional" style={{ width: '100%', maxWidth: 440, padding: '36px 32px' }}>
          <p className="section-label" style={{ marginBottom: 6 }}>NextBlock account</p>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 24, fontWeight: 400, color: '#0F1218', marginBottom: 8 }}>
            You are signed in
          </h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#6B7280', lineHeight: 1.6, marginBottom: 20 }}>
            {profile?.user.email ?? 'Email account active.'} — the email identity tracks applications
            and notifications; on-chain actions still require an authorized wallet.
          </p>

          <form onSubmit={handleSetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            <label style={labelStyle} htmlFor="auth-new-password">
              {passwordSaved ? 'Password saved — you can now sign in with it' : 'Set a password (optional, skips the magic link next time)'}
            </label>
            <input
              id="auth-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              style={inputStyle}
              autoComplete="new-password"
            />
            {passwordError && (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#991B1B', margin: 0 }}>{passwordError}</p>
            )}
            <button
              type="submit"
              disabled={savingPassword || newPassword.length === 0}
              style={{
                padding: '11px 22px',
                background: savingPassword || newPassword.length === 0 ? '#94A3B8' : 'rgba(27,58,107,0.08)',
                color: savingPassword || newPassword.length === 0 ? '#FFFFFF' : '#1B3A6B',
                borderRadius: 50,
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                border: '1px solid rgba(27,58,107,0.25)',
                cursor: savingPassword ? 'wait' : 'pointer',
              }}
            >
              {savingPassword ? 'Saving…' : passwordSaved ? 'Update password' : 'Save password'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => router.replace(redirect)}
            style={{ width: '100%', padding: '13px 24px', background: '#1B3A6B', color: '#FFFFFF', borderRadius: 50, fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            Continue to the app →
          </button>
        </div>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signInWithEmail(email, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? 'Sign-in failed. Try again.');
      return;
    }
    if (result.mode === 'password') {
      router.replace(redirect);
      return;
    }
    setSentTo(email.trim().toLowerCase());
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div className="card-institutional" style={{ width: '100%', maxWidth: 440, padding: '36px 32px' }}>
        <p className="section-label" style={{ marginBottom: 6 }}>NextBlock account</p>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 26, fontWeight: 400, color: '#0F1218', marginBottom: 8 }}>
          Sign in or register
        </h1>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#6B7280', lineHeight: 1.6, marginBottom: 24 }}>
          Enter your email and we&rsquo;ll send you a secure sign-in link — a new address becomes an
          account automatically. The email identity tracks your applications and notifications;
          on-chain actions always require a connected, authorized wallet.
        </p>

        {sentTo ? (
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '18px 16px' }}>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: '#166534', margin: 0, lineHeight: 1.6 }}>
              <strong>Link sent to {sentTo}.</strong> Open it from this device to complete the
              sign-in. Check the spam folder if it doesn&rsquo;t arrive within a minute.
            </p>
            <button
              type="button"
              onClick={() => setSentTo(null)}
              style={{ marginTop: 12, background: 'none', border: 'none', fontSize: 12, color: '#166534', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
            >
              Use a different address
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle} htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                style={inputStyle}
                autoComplete="email"
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="auth-password">Password (only if you set one)</label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave empty for a magic link"
                style={inputStyle}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#991B1B', margin: 0 }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '13px 24px',
                background: submitting ? '#94A3B8' : '#1B3A6B',
                color: '#FFFFFF',
                borderRadius: 50,
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                border: 'none',
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              {submitting ? 'Sending…' : password ? 'Sign in' : 'Send sign-in link'}
            </button>
          </form>
        )}

        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#9A9A9A', marginTop: 20, lineHeight: 1.6 }}>
          Looking for the vaults? <Link href="/app" style={{ color: '#1B3A6B', fontWeight: 600 }}>Browse without an account</Link> —
          email is only needed for applications and notifications.
        </p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthPageInner />
    </Suspense>
  );
}
