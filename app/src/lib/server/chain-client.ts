import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

/**
 * The server's read client for Base Sepolia.
 *
 * Every API route used to build its own with a bare `http(url)`, which retries
 * nothing. One blip on the upstream endpoint therefore failed the request, and
 * because a 5-minute cron drives some of those routes, each blip mailed the
 * owner a red workflow.
 *
 * Those blips are real and not rare: the shared endpoint at sepolia.base.org
 * answers `eth_blockNumber` while returning
 * `-32011 no backend is currently healthy to serve traffic` for `eth_call`
 * across every contract — observed for minutes at a time. Nothing about the
 * protocol is wrong when that happens, and nothing needs a human.
 *
 * So the transport retries with backoff, and callers are given a way to say
 * "this failed upstream" rather than "this failed". The distinction decides
 * whether a scheduled job should page anyone.
 *
 * The durable fix is a dedicated endpoint: set `BASE_SEPOLIA_RPC_URL`. The
 * public one is shared with everybody and rate-limited accordingly.
 */

const PUBLIC_FALLBACK = 'https://sepolia.base.org';

export function rpcUrl(): string {
  const configured = process.env.BASE_SEPOLIA_RPC_URL;
  return configured && configured.length > 0 ? configured : PUBLIC_FALLBACK;
}

/** True when no dedicated endpoint is configured and the shared one is in use. */
export function usingPublicRpc(): boolean {
  return rpcUrl() === PUBLIC_FALLBACK;
}

export function createChainClient() {
  return createPublicClient({
    chain: baseSepolia,
    // Four attempts over roughly three seconds. Long enough to ride out the
    // short unhealthy windows seen on the shared endpoint, short enough to stay
    // well inside a serverless request budget.
    transport: http(rpcUrl(), { retryCount: 3, retryDelay: 400, timeout: 10_000 }),
  });
}

/**
 * Recognises a failure that came from the endpoint rather than from us.
 *
 * A transient upstream outage and a genuine fault deserve different responses:
 * the first is retried by the next scheduled run and should stay quiet, the
 * second wants attention. Guessing wrong in either direction is costly — a
 * missed alert, or an alert nobody reads because it cries wolf every hour.
 */
export function isUpstreamUnavailable(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return (
    text.includes('-32011') || // no backend is currently healthy to serve traffic
    text.includes('no backend is currently healthy') ||
    text.includes('HttpRequestError') ||
    text.includes('TimeoutError') ||
    /\b(429|502|503|504)\b/.test(text)
  );
}
