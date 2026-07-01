/**
 * Pure, isomorphic cedant auth message — shared by the client (which signs it)
 * and the server verifier (lib/portfolio/auth.ts). No server-only imports here
 * so it is safe to bundle into a client component.
 */

/** Seconds a cedant signature stays valid (60s skew tolerated). */
export const CEDANT_AUTH_WINDOW_SECONDS = 300;

/** Canonical EIP-191 message binding the action (which includes the content hash). */
export function cedantAuthMessage(action: string, timestamp: number): string {
  return `NextBlock cedant authentication\naction: ${action}\ntimestamp: ${timestamp}`;
}
