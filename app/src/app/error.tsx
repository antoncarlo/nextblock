'use client';

import { useEffect } from 'react';

/**
 * Route-level error boundary (Next.js app router convention). Renders a
 * recoverable fallback instead of a blank page and logs a structured,
 * PII-free line for diagnostics.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        scope: 'route-error-boundary',
        name: error.name,
        digest: error.digest ?? null,
      }),
    );
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h2 className="mb-2 text-lg font-semibold text-gray-900">
        Something went wrong
      </h2>
      <p className="mb-6 max-w-md text-sm text-gray-500">
        An unexpected error occurred while rendering this page. Your funds and
        on-chain state are unaffected. You can retry, or reconnect your wallet
        if the problem persists.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Try again
      </button>
    </div>
  );
}
