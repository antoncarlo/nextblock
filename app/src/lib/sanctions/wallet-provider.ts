/**
 * Wallet-level sanctions screening (Batch F).
 *
 * Distinct from name-screening (`provider.ts`): this layer screens an ON-CHAIN ADDRESS.
 * Name screening catches sanctioned ENTITIES at onboarding; wallet screening catches the
 * complementary case of an unsanctioned entity onboarding a sanctioned wallet.
 *
 *   - `ChainalysisOracleProvider` (`chainalysis-oracle`) — reads Chainalysis's public
 *     sanctions oracle on Base mainnet (`isSanctioned(address)`). Free, no account, no
 *     key; the oracle reflects the US, EU and UN lists as Chainalysis publishes them.
 *     The default on production. It answers sanctioned / not sanctioned and nothing
 *     else: no risk scoring, no mixer or scam clusters, no UK list, and no evidence
 *     trail beyond the answer — every result says so.
 *   - `MockWalletScreeningProvider` — deterministic fixture for dev/CI only
 *     (addresses containing "dead" or "beef"). REFUSED on production.
 *
 * Provider selection: `WALLET_SCREENING_PROVIDER=chainalysis-oracle|mock`. Outside
 * production the default is `mock`; on production it is `chainalysis-oracle`. A failed
 * read is an `error`, never `clear`.
 *
 * Pure (no DOM, no Next) — strip-types smoke compatible.
 */

import { encodeFunctionData, decodeFunctionResult, parseAbi } from 'viem';
import { isProduction, MockProviderForbiddenError, type Env } from '../providers/production.ts';

export type WalletRiskCode = 'clear' | 'match' | 'error';
export type WalletRiskSeverity = 'low' | 'medium' | 'high' | 'unknown';

export interface WalletScreeningSubject {
  /** Lowercase 0x address being screened. */
  address: `0x${string}`;
  /** Optional KYB application UUID for audit linkage. */
  kybApplicationUuid?: string;
}

export interface WalletScreeningMatch {
  /** Provider-returned match id. Opaque to us. */
  providerMatchId: string;
  /** Risk category: sanctioned, mixer, scam, ransom, dark-market, … */
  category: string;
  severity: WalletRiskSeverity;
  /** Optional 0..1 confidence the provider attaches to the match. */
  score?: number;
  evidence?: Record<string, unknown>;
}

export interface WalletScreeningResult {
  provider: 'mock' | 'chainalysis-oracle';
  providerCorrelationId?: string;
  resultCode: WalletRiskCode;
  matches: WalletScreeningMatch[];
  rawResponse?: Record<string, unknown>;
  errorMessage?: string;
}

export interface WalletScreeningProvider {
  readonly name: 'mock' | 'chainalysis-oracle';
  screen(subject: WalletScreeningSubject): Promise<WalletScreeningResult>;
}

/**
 * Deterministic mock. Magic substrings drive the outcome:
 *   - `dead` → high OFAC-SDN match
 *   - `beef` → medium mixer match
 *   - everything else → clear
 *
 * For dev and CI only; production refuses it.
 */
export class MockWalletScreeningProvider implements WalletScreeningProvider {
  readonly name = 'mock' as const;

  async screen(subject: WalletScreeningSubject): Promise<WalletScreeningResult> {
    const lower = subject.address.toLowerCase();
    if (lower.includes('dead')) {
      return {
        provider: 'mock',
        providerCorrelationId: `mock-${Date.now()}`,
        resultCode: 'match',
        matches: [
          {
            providerMatchId: 'mock-wallet-ofac-1',
            category: 'OFAC-SDN',
            severity: 'high',
            score: 0.97,
            evidence: { note: 'mock fixture — magic substring `dead`' },
          },
        ],
      };
    }
    if (lower.includes('beef')) {
      return {
        provider: 'mock',
        providerCorrelationId: `mock-${Date.now()}`,
        resultCode: 'match',
        matches: [
          {
            providerMatchId: 'mock-wallet-mixer-1',
            category: 'mixer',
            severity: 'medium',
            score: 0.74,
            evidence: { note: 'mock fixture — magic substring `beef`' },
          },
        ],
      };
    }
    return {
      provider: 'mock',
      providerCorrelationId: `mock-${Date.now()}`,
      resultCode: 'clear',
      matches: [],
    };
  }
}

/** Chainalysis sanctions oracle on Base mainnet (chain id 8453). */
export const CHAINALYSIS_ORACLE_BASE = '0x3A91A31cB3dC49b4db9Ce721F50a9D076c8D739B';
export const DEFAULT_ORACLE_RPC = 'https://mainnet.base.org';
const ORACLE_ABI = parseAbi(['function isSanctioned(address addr) view returns (bool)']);

const ORACLE_COVERAGE =
  'Chainalysis public sanctions oracle (US, EU and UN lists as Chainalysis publishes them); a yes/no answer per address. ' +
  'Not covered: risk scoring, mixers, scams, the UK list, transaction history.';

export interface OracleProviderOptions {
  rpcUrl?: string;
  oracle?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Reads the oracle with a plain JSON-RPC `eth_call`. Sanctions status belongs to the
 * address, not to a chain, so the Base mainnet oracle is queried for every wallet,
 * including the Base Sepolia wallets of the staging deployment.
 */
export class ChainalysisOracleProvider implements WalletScreeningProvider {
  readonly name = 'chainalysis-oracle' as const;
  private readonly rpcUrl: string;
  private readonly oracle: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: OracleProviderOptions = {}) {
    this.rpcUrl = opts.rpcUrl ?? DEFAULT_ORACLE_RPC;
    this.oracle = opts.oracle ?? CHAINALYSIS_ORACLE_BASE;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  async screen(subject: WalletScreeningSubject): Promise<WalletScreeningResult> {
    const fail = (message: string): WalletScreeningResult => ({
      provider: 'chainalysis-oracle',
      resultCode: 'error',
      matches: [],
      errorMessage: message,
    });

    const data = encodeFunctionData({ abi: ORACLE_ABI, functionName: 'isSanctioned', args: [subject.address] });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let payload: { result?: string; error?: { message?: string } };
    try {
      const res = await this.fetchImpl(this.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to: this.oracle, data }, 'latest'],
        }),
        signal: controller.signal,
      });
      if (!res.ok) return fail(`oracle RPC answered HTTP ${res.status}`);
      payload = (await res.json()) as typeof payload;
    } catch (err) {
      return fail(
        controller.signal.aborted
          ? 'oracle RPC timed out'
          : `oracle RPC unreachable (${err instanceof Error ? err.name : 'error'})`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (payload.error || typeof payload.result !== 'string') {
      return fail(`oracle call failed: ${payload.error?.message?.slice(0, 120) ?? 'no result'}`);
    }
    let sanctioned: boolean;
    try {
      sanctioned = decodeFunctionResult({
        abi: ORACLE_ABI,
        functionName: 'isSanctioned',
        data: payload.result as `0x${string}`,
      });
    } catch {
      return fail('oracle returned something that is not a boolean (wrong address or chain?)');
    }

    const checkedAt = new Date().toISOString();
    const rawResponse = { coverage: ORACLE_COVERAGE, oracle: this.oracle, chainId: 8453, checkedAt };
    if (sanctioned) {
      return {
        provider: 'chainalysis-oracle',
        resultCode: 'match',
        matches: [
          {
            providerMatchId: `chainalysis-oracle:${subject.address}`,
            category: 'sanctioned-address',
            severity: 'high',
            score: 1,
            evidence: { source: 'Chainalysis sanctions oracle', chainId: 8453, oracle: this.oracle, checkedAt },
          },
        ],
        rawResponse,
      };
    }
    return { provider: 'chainalysis-oracle', resultCode: 'clear', matches: [], rawResponse };
  }
}

export function getWalletScreeningProvider(env: Env = process.env): WalletScreeningProvider {
  const production = isProduction(env);
  const selected = (env.WALLET_SCREENING_PROVIDER ?? (production ? 'chainalysis-oracle' : 'mock')).toLowerCase();
  if (selected === 'chainalysis-oracle') {
    return new ChainalysisOracleProvider({ rpcUrl: env.WALLET_SCREENING_RPC_URL || undefined });
  }
  if (selected === 'mock') {
    if (production) throw new MockProviderForbiddenError('wallet screening');
    return new MockWalletScreeningProvider();
  }
  throw new Error(`WALLET_SCREENING_PROVIDER="${selected}" is not a known provider`);
}
