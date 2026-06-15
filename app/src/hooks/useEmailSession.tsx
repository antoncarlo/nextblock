'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppAccessRole = 'admin' | 'kyb_operator' | 'reviewer' | 'support';

export interface EmailWalletLink {
  address: `0x${string}`;
  label: string | null;
  isPrimary: boolean;
}

export interface EmailAppProfile {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  roles: AppAccessRole[];
  wallets: EmailWalletLink[];
}

interface EmailSessionContextValue {
  session: Session | null;
  profile: EmailAppProfile | null;
  loading: boolean;
  profileLoading: boolean;
  error: string | null;
  isEmailAuthenticated: boolean;
  isAppAdmin: boolean;
  canOperateKyb: boolean;
  canOperateProtocol: boolean;
  accessToken: string | null;
  signInWithEmail: (email: string, password?: string) => Promise<{ ok: boolean; error?: string; mode?: 'password' | 'magic_link' }>;
  signOutEmail: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const EmailSessionContext = createContext<EmailSessionContextValue | null>(null);

function includesRole(roles: readonly AppAccessRole[], candidates: readonly AppAccessRole[]): boolean {
  return candidates.some(role => roles.includes(role));
}

async function fetchProfile(session: Session): Promise<EmailAppProfile> {
  const response = await fetch('/api/app/me', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'email profile unavailable');
  }

  return payload as EmailAppProfile;
}

export function EmailSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<EmailAppProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const currentSession = data.session;
    setSession(currentSession ?? null);

    if (!currentSession) {
      setProfile(null);
      setError(null);
      return;
    }

    setProfileLoading(true);
    try {
      const nextProfile = await fetchProfile(currentSession);
      setProfile(nextProfile);
      setError(null);
    } catch (profileError) {
      setProfile(null);
      setError(profileError instanceof Error ? profileError.message : 'email profile unavailable');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
      if (data.session) {
        void refreshProfile();
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      if (!nextSession) {
        setProfile(null);
        setError(null);
      } else {
        void refreshProfile();
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  const signInWithEmail = useCallback(async (email: string, password?: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password?.trim() ?? '';
    if (!normalizedEmail) {
      return { ok: false, error: 'Inserisci un indirizzo email valido.' };
    }

    if (normalizedPassword) {
      const { error: passwordError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      });

      if (passwordError) {
        return { ok: false, error: passwordError.message };
      }
      return { ok: true, mode: 'password' as const };
    }

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/app/admin` : undefined,
      },
    });

    if (signInError) {
      return { ok: false, error: signInError.message };
    }
    return { ok: true, mode: 'magic_link' as const };
  }, []);

  const signOutEmail = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setError(null);
  }, []);

  const value = useMemo<EmailSessionContextValue>(() => {
    const roles = profile?.roles ?? [];
    return {
      session,
      profile,
      loading,
      profileLoading,
      error,
      isEmailAuthenticated: Boolean(session && profile),
      isAppAdmin: includesRole(roles, ['admin']),
      canOperateKyb: includesRole(roles, ['admin', 'kyb_operator', 'reviewer']),
      canOperateProtocol: includesRole(roles, ['admin', 'kyb_operator']),
      accessToken: session?.access_token ?? null,
      signInWithEmail,
      signOutEmail,
      refreshProfile,
    };
  }, [error, loading, profile, profileLoading, refreshProfile, session, signInWithEmail, signOutEmail]);

  return <EmailSessionContext.Provider value={value}>{children}</EmailSessionContext.Provider>;
}

export function useEmailSession() {
  const context = useContext(EmailSessionContext);
  if (!context) {
    throw new Error('useEmailSession must be used inside EmailSessionProvider');
  }
  return context;
}
