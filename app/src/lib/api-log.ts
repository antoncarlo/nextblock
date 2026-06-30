/**
 * Backwards-compatible facade around the structured logging in observability.ts.
 *
 * Existing call sites import `logApiError` from `@/lib/api-log`. New call sites
 * should prefer the richer helpers in `@/lib/observability` directly
 * (`logApiInfo` / `logApiWarn` / `withRequestLogging` / `getRequestId`), but
 * this re-export keeps the existing fleet of routes building unchanged.
 */
export { logApiError, logApiInfo, logApiWarn, withRequestLogging, getRequestId } from './observability';
export type { LogLevel, LogDetail } from './observability';
