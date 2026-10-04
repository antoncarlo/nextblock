import { createPublicClient, fallback, http } from 'viem';
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
 *
 * A dedicated endpoint can itself stop answering for a long time — an exhausted
 * monthly quota (HTTP 429) is the usual case, and it belongs to the whole provider
 * account, not to this app. So the transport falls back to the public endpoint when
 * the configured one fails, and nothing that leaves the server may carry the
 * configured URL: provider URLs embed their API key.
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

export interface RpcTransportOptions {
  /** Configured endpoint; defaults to BASE_SEPOLIA_RPC_URL or the public one. */
  primary?: string;
  /** Endpoint tried when the primary fails; defaults to the public one. */
  fallbackUrl?: string;
}

/**
 * Transport for every server-side read: the configured endpoint first, the public
 * one if that fails. Four attempts over roughly three seconds per endpoint. Long
 * enough to ride out the short unhealthy windows seen on the shared endpoint, short
 * enough to stay well inside a serverless request budget.
 */
export function rpcTransport(opts: RpcTransportOptions = {}) {
  const primary = opts.primary ?? rpcUrl();
  const fallbackUrl = opts.fallbackUrl ?? PUBLIC_FALLBACK;
  const first = http(primary, { retryCount: 3, retryDelay: 400, timeout: 10_000 });
  if (primary === fallbackUrl) return first;
  return fallback([first, http(fallbackUrl, { retryCount: 2, retryDelay: 400, timeout: 10_000 })], {
    retryCount: 0,
  });
}

export function createChainClient() {
  return createPublicClient({ chain: baseSepolia, transport: rpcTransport() });
}

/**
 * A description of an RPC failure that is safe to return to a caller or print in a log
 * anyone can read. Never the error message: viem puts the full request URL, API key
 * included, in it.
 */
export function describeRpcFailure(error: unknown): string {
  const e = error as { name?: string; status?: number; message?: string; cause?: { status?: number } } | null;
  const status = e?.status ?? e?.cause?.status;
  const text = `${e?.name ?? ''} ${typeof e?.message === 'string' ? e.message : ''}`;
  if (status === 429 || /\b429\b|capacity limit|rate.?limit/i.test(text)) return 'rate limited or quota exhausted (HTTP 429)';
  if (e?.name === 'TimeoutError' || /timeout|timed out/i.test(text)) return 'timed out';
  if (typeof status === 'number') return `HTTP ${status}`;
  if (text.includes('-32011') || text.includes('no backend is currently healthy')) return 'upstream unhealthy';
  return 'unreachable';
}

export interface RpcProbe {
  ok: boolean;
  ms: number;
  /** null when all is well; otherwise a safe description, advisory when ok is true. */
  error: string | null;
  /** Host only, never the path or key. */
  host: string;
}

/**
 * One quick reachability check, the configured endpoint first and the public one if
 * that fails. `ok` means the server can read the chain; `error` says if it is doing so
 * through the fallback, so a dead provider quota is visible without being an outage.
 */
export async function probeRpc(opts: RpcTransportOptions & { timeoutMs?: number } = {}): Promise<RpcProbe> {
  const primary = opts.primary ?? rpcUrl();
  const fallbackUrl = opts.fallbackUrl ?? PUBLIC_FALLBACK;
  const timeout = opts.timeoutMs ?? 3000;
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const attempt = async (url: string) => {
    await createPublicClient({ chain: baseSepolia, transport: http(url, { retryCount: 0, timeout }) }).getBlockNumber();
  };
  const hostOf = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return 'invalid-url';
    }
  };
  try {
    await attempt(primary);
    return { ok: true, ms: elapsed(), error: null, host: hostOf(primary) };
  } catch (primaryErr) {
    const why = describeRpcFailure(primaryErr);
    if (primary === fallbackUrl) return { ok: false, ms: elapsed(), error: why, host: hostOf(primary) };
    try {
      await attempt(fallbackUrl);
      return {
        ok: true,
        ms: elapsed(),
        error: `advisory: the configured endpoint (${hostOf(primary)}) is failing (${why}); the public fallback is serving`,
        host: hostOf(fallbackUrl),
      };
    } catch (fallbackErr) {
      return {
        ok: false,
        ms: elapsed(),
        error: `${hostOf(primary)}: ${why}; public fallback: ${describeRpcFailure(fallbackErr)}`,
        host: hostOf(primary),
      };
    }
  }
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
