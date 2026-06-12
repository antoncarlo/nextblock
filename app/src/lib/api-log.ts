/**
 * Structured, PII-free error logging for API routes. One JSON line per
 * event so platform log search (Vercel) can filter by route/kind. Never log
 * payloads, wallet addresses, emails or other request content.
 */
export function logApiError(
  route: string,
  kind: string,
  detail?: { code?: string | number | null },
): void {
  console.error(
    JSON.stringify({
      level: 'error',
      route,
      kind,
      code: detail?.code ?? null,
      at: new Date().toISOString(),
    }),
  );
}
