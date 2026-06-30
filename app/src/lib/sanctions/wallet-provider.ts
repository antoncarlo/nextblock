/**
 * Wallet-level sanctions screening (Batch F).
 *
 * Distinct from name-screening (`provider.ts` → ComplyAdvantage): this layer
 * screens an ON-CHAIN ADDRESS for ties to OFAC-listed wallets, sanctioned
 * mixers, ransom payments, known-fraud clusters, and so on. Name screening
 * catches sanctioned ENTITIES at onboarding; wallet screening catches the
 * complementary case of an unsanctioned entity onboarding a wallet that has
 * known illicit history (or, post-onboarding, starts receiving funds from one).
 *
 * MVP ships:
 *   - `MockWalletScreeningProvider` — deterministic for dev/CI/pilot.
 *      Addresses whose lowercase hex contains "dead" return a high-risk
 *      OFAC match; addresses containing "beef" return a medium mixer match;
 *      everything else is clear.
 *   - `ChainalysisKYTStub` — placeholder that throws "not configured"
 *      until the real Chainalysis KYT (or TRM Labs) integration is
 *      wired up with `WALLET_SCREENING_API_KEY`. Fail-loud so ops never
 *      silently let an address through as "clear" when the real provider
 *      isn't actually running.
 *
 * Provider selection: `WALLET_SCREENING_PROVIDER=mock|chainalysis|trm`
 * (default `mock`). With a non-mock value but missing key, the factory
 * throws and callers surface 503 to the KYB approve flow.
 *
 * Pure (no DOM, no Next) — strip-types smoke compatible.
 */

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
  provider: 'mock' | 'chainalysis' | 'trm';
  providerCorrelationId?: string;
  resultCode: WalletRiskCode;
  matches: WalletScreeningMatch[];
  rawResponse?: Record<string, unknown>;
  errorMessage?: string;
}

export interface WalletScreeningProvider {
  readonly name: 'mock' | 'chainalysis' | 'trm';
  screen(subject: WalletScreeningSubject): Promise<WalletScreeningResult>;
}

/**
 * Deterministic mock. Magic substrings drive the outcome:
 *   - `dead` → high OFAC-SDN match
 *   - `beef` → medium mixer match
 *   - everything else → clear
 *
 * Used in dev/CI/pilot until the real provider is wired. Never used in
 * production with real subjects.
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

/**
 * Stub for Chainalysis KYT. Throws on call until a real client is wired.
 * This keeps the wiring path explicit: the operator must consciously flip
 * `WALLET_SCREENING_PROVIDER` and the implementation, never accidentally
 * end up calling an unfinished stub in production.
 */
export class ChainalysisKYTStub implements WalletScreeningProvider {
  readonly name = 'chainalysis' as const;
  async screen(_subject: WalletScreeningSubject): Promise<WalletScreeningResult> {
    throw new Error('ChainalysisKYTStub: provider not configured (no API client)');
  }
}

/**
 * Stub for TRM Labs. Same posture as the Chainalysis stub.
 */
export class TRMLabsStub implements WalletScreeningProvider {
  readonly name = 'trm' as const;
  async screen(_subject: WalletScreeningSubject): Promise<WalletScreeningResult> {
    throw new Error('TRMLabsStub: provider not configured (no API client)');
  }
}

export function getWalletScreeningProvider(
  env: NodeJS.ProcessEnv = process.env,
): WalletScreeningProvider {
  const selected = (env.WALLET_SCREENING_PROVIDER ?? 'mock').toLowerCase();
  if (selected === 'chainalysis') {
    const key = env.WALLET_SCREENING_API_KEY;
    if (!key) {
      throw new Error('WALLET_SCREENING_PROVIDER=chainalysis but WALLET_SCREENING_API_KEY is not set');
    }
    return new ChainalysisKYTStub();
  }
  if (selected === 'trm') {
    const key = env.WALLET_SCREENING_API_KEY;
    if (!key) {
      throw new Error('WALLET_SCREENING_PROVIDER=trm but WALLET_SCREENING_API_KEY is not set');
    }
    return new TRMLabsStub();
  }
  return new MockWalletScreeningProvider();
}
