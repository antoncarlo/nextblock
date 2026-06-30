'use client';

import { useEffect } from 'react';

/**
 * Global error boundary — Next.js app router backstop that catches errors
 * thrown by the root layout itself (which the route-level `error.tsx` cannot
 * catch, since it lives inside the layout it's protecting).
 *
 * Renders a minimal page with its own <html>/<body> because the layout was
 * the thing that broke. Logs a structured PII-free line via console.error so
 * Vercel log search can group these — there's no Sentry SDK wired yet, but
 * the call site is in the right place when one lands.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        scope: 'global-error-boundary',
        name: error.name,
        digest: error.digest ?? null,
        at: new Date().toISOString(),
      }),
    );
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafaf8',
          color: '#111827',
        }}
      >
        <div style={{ maxWidth: 480, padding: '24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            NextBlock encountered a critical error
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
            The root layout failed to render. Your funds and on-chain state are unaffected.
            Reload the page or contact ops if the problem persists.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#111827',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
