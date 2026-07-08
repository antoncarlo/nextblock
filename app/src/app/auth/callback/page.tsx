'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/integrations/supabase/client';

/**
 * Magic-link landing. supabase-js processes the token in the URL hash
 * automatically (detectSessionInUrl); this page waits for the session to
 * materialise, then forwards to the redirect target. A dead link (expired,
 * already used, opened in another browser) gets an explicit retry path
 * instead of a silent dead end.
 */

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/app';
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let settled = false;

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled || settled) return;
      if (session) {
        settled = true;
        router.replace(redirect);
      }
    });

    // The session may already be in storage (link opened twice, or password
    // sign-in landing here) — check once, then rely on the listener.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || settled) return;
      if (data.session) {
        settled = true;
        router.replace(redirect);
      }
    });

    const timeout = setTimeout(() => {
      if (!cancelled && !settled) setFailed(true);
    }, 8000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.subscription.unsubscribe();
    };
  }, [redirect, router]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div className="card-institutional" style={{ width: '100%', maxWidth: 440, padding: '36px 32px', textAlign: 'center' }}>
        {failed ? (
          <>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 400, color: '#0F1218', marginBottom: 10 }}>
              This link didn&rsquo;t work
            </h1>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#6B7280', lineHeight: 1.6, marginBottom: 20 }}>
              Sign-in links expire quickly and work once, in the browser where you requested them.
              Request a fresh one — it takes a few seconds.
            </p>
            <Link
              href="/auth"
              style={{ display: 'inline-block', padding: '12px 28px', background: '#1B3A6B', color: '#FFFFFF', borderRadius: 50, fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
            >
              Request a new link
            </Link>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 400, color: '#0F1218', marginBottom: 10 }}>
              Signing you in…
            </h1>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>
              Verifying the sign-in link. You&rsquo;ll be forwarded in a moment.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}
