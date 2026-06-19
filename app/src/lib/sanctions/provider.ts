/**
 * Sanctions screening provider — pluggable adapter (Pilot Readiness gap #1).
 *
 * Two implementations:
 *   - `ComplyAdvantageProvider` — production HTTPS client against
 *     api.complyadvantage.com (name screening: sanctions / PEP / adverse
 *     media). Requires COMPLY_ADVANTAGE_API_KEY.
 *   - `MockSanctionsProvider`   — deterministic local fixture for local dev
 *     and CI, used until the operator provisions a real key. Returns "match"
 *     only when the subject name contains the magic substring `__SANCTION__`.
 *
 * The provider is selected by env: `SANCTIONS_PROVIDER=complyadvantage|mock`.
 * Default is `mock`, fail-safe-loud: if `SANCTIONS_PROVIDER=complyadvantage`
 * but the API key is missing, screening returns an `error` result rather
 * than silently falling back to mock — we never tell the operator a subject
 * is clean unless a real provider said so.
 */

export type SanctionsResultCode = 'clear' | 'match' | 'error';
export type SanctionsSeverity = 'low' | 'medium' | 'high' | 'unknown';

export interface SanctionsSubject {
  /** KYB application UUID for audit linkage; never logged. */
  kybApplicationUuid?: string;
  kind: 'entity' | 'individual';
  /** Full legal name as submitted in KYB. */
  name: string;
  /** ISO-3166 alpha-2 country code, when known. */
  country?: string;
}

export interface SanctionsMatch {
  /** Provider-returned match id; opaque to us. */
  providerMatchId: string;
  matchedName: string;
  /** Canonical list code: OFAC-SDN | EU-CFSP | UN-1267 | HMT-UK | PEP | adverse-media | other. */
  sanctionsList: string;
  severity: SanctionsSeverity;
  /** 0..1 similarity score where available. */
  matchScore?: number;
  evidence?: Record<string, unknown>;
}

export interface SanctionsScreeningResult {
  provider: 'complyadvantage' | 'mock';
  providerSearchId?: string;
  resultCode: SanctionsResultCode;
  matches: SanctionsMatch[];
  /** Provider response (already redacted of secrets) — kept for audit. */
  rawResponse?: Record<string, unknown>;
  errorMessage?: string;
}

export interface SanctionsProvider {
  readonly name: 'complyadvantage' | 'mock';
  screen(subject: SanctionsSubject): Promise<SanctionsScreeningResult>;
}

/**
 * MockSanctionsProvider — deterministic, no network.
 *
 * Behavior:
 *   - if `subject.name` contains `__SANCTION__` (case-insensitive) → 1 high
 *     match on a synthetic OFAC-SDN entry
 *   - if it contains `__PEP__` → 1 medium PEP match
 *   - else → clear, no matches
 *
 * Used in local dev, CI, and pilot until the operator provisions
 * COMPLY_ADVANTAGE_API_KEY. Never used in production with real subjects.
 */
export class MockSanctionsProvider implements SanctionsProvider {
  readonly name = 'mock' as const;

  async screen(subject: SanctionsSubject): Promise<SanctionsScreeningResult> {
    const n = subject.name.toUpperCase();
    if (n.includes('__SANCTION__')) {
      return {
        provider: 'mock',
        providerSearchId: `mock-search-${Date.now()}`,
        resultCode: 'match',
        matches: [
          {
            providerMatchId: 'mock-match-sdn-1',
            matchedName: subject.name,
            sanctionsList: 'OFAC-SDN',
            severity: 'high',
            matchScore: 0.95,
            evidence: { note: 'mock fixture for E2E dev only' },
          },
        ],
      };
    }
    if (n.includes('__PEP__')) {
      return {
        provider: 'mock',
        providerSearchId: `mock-search-${Date.now()}`,
        resultCode: 'match',
        matches: [
          {
            providerMatchId: 'mock-match-pep-1',
            matchedName: subject.name,
            sanctionsList: 'PEP',
            severity: 'medium',
            matchScore: 0.78,
            evidence: { note: 'mock PEP fixture' },
          },
        ],
      };
    }
    return {
      provider: 'mock',
      providerSearchId: `mock-search-${Date.now()}`,
      resultCode: 'clear',
      matches: [],
    };
  }
}

/**
 * ComplyAdvantageProvider — production client.
 *
 * Calls the "searches" endpoint with the subject name + optional country.
 * Maps CA's `share_url`, `list`/`source` codes and `match_status` into our
 * canonical shape. Network errors and HTTP non-2xx become `result: 'error'`
 * — never silently `clear`.
 *
 * Reference: https://docs.complyadvantage.com/api/  — kept thin & explicit.
 */
export class ComplyAdvantageProvider implements SanctionsProvider {
  readonly name = 'complyadvantage' as const;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(apiKey: string, baseUrl = 'https://api.complyadvantage.com') {
    if (!apiKey) throw new Error('ComplyAdvantageProvider: missing apiKey');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async screen(subject: SanctionsSubject): Promise<SanctionsScreeningResult> {
    const body: Record<string, unknown> = {
      search_term: subject.name,
      client_ref: subject.kybApplicationUuid ? `kyb-${subject.kybApplicationUuid}` : undefined,
      fuzziness: 0.6,
      filters: {
        types: ['sanction', 'warning', 'pep'],
        ...(subject.country ? { country_codes: [subject.country] } : {}),
      },
    };
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/searches?api_key=${encodeURIComponent(this.apiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return {
        provider: 'complyadvantage',
        resultCode: 'error',
        matches: [],
        errorMessage: err instanceof Error ? err.message.slice(0, 200) : 'network',
      };
    }
    if (!res.ok) {
      return {
        provider: 'complyadvantage',
        resultCode: 'error',
        matches: [],
        errorMessage: `http ${res.status}`,
      };
    }
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      return {
        provider: 'complyadvantage',
        resultCode: 'error',
        matches: [],
        errorMessage: 'invalid json',
      };
    }
    return normalizeComplyAdvantage(payload as Record<string, unknown>);
  }
}

/**
 * Provider factory. Reads env at call time so tests can swap.
 *
 * Behavior:
 *   - SANCTIONS_PROVIDER unset or 'mock'   → MockSanctionsProvider
 *   - SANCTIONS_PROVIDER='complyadvantage' AND key present → real
 *   - SANCTIONS_PROVIDER='complyadvantage' AND key MISSING → throw; the
 *     caller surfaces a 503 to the KYB approval flow rather than silently
 *     letting subjects through unscreened.
 */
export function getSanctionsProvider(env: NodeJS.ProcessEnv = process.env): SanctionsProvider {
  const selected = (env.SANCTIONS_PROVIDER ?? 'mock').toLowerCase();
  if (selected === 'complyadvantage') {
    const key = env.COMPLY_ADVANTAGE_API_KEY;
    if (!key) {
      throw new Error('SANCTIONS_PROVIDER=complyadvantage but COMPLY_ADVANTAGE_API_KEY is not set');
    }
    return new ComplyAdvantageProvider(key);
  }
  return new MockSanctionsProvider();
}

/**
 * Pure transform from CA's "search created" response into our canonical
 * shape. Exported for unit/smoke testing without a live API key.
 *
 * Expected envelope (per CA docs, abridged):
 *   { content: { data: { id, hits: [ { match_status, score, doc: { name, sources:[{name}], types:[...] } } ] } } }
 */
export function normalizeComplyAdvantage(payload: Record<string, unknown>): SanctionsScreeningResult {
  const content = (payload.content as Record<string, unknown> | undefined) ?? {};
  const data = (content.data as Record<string, unknown> | undefined) ?? {};
  const searchId = data.id !== undefined ? String(data.id) : undefined;
  const hits = (data.hits as ReadonlyArray<Record<string, unknown>> | undefined) ?? [];

  const matches: SanctionsMatch[] = hits.map((h, i) => {
    const doc = (h.doc as Record<string, unknown> | undefined) ?? {};
    const sources = (doc.sources as ReadonlyArray<Record<string, unknown>> | undefined) ?? [];
    const firstSource = sources[0];
    const types = (doc.types as ReadonlyArray<string> | undefined) ?? [];

    let sanctionsList = 'other';
    if (firstSource && typeof firstSource.name === 'string') {
      sanctionsList = canonicalListCode(firstSource.name);
    } else if (types.includes('sanction')) {
      sanctionsList = 'OFAC-SDN'; // conservative default
    } else if (types.includes('pep')) {
      sanctionsList = 'PEP';
    } else if (types.includes('adverse-media')) {
      sanctionsList = 'adverse-media';
    }

    return {
      providerMatchId: h.id !== undefined ? String(h.id) : `idx-${i}`,
      matchedName: typeof doc.name === 'string' ? doc.name : 'unknown',
      sanctionsList,
      severity: severityFromScore(h.score),
      matchScore: typeof h.score === 'number' ? h.score : undefined,
      evidence: {
        match_status: h.match_status,
        sources: sources.map((s) => s.name).filter(Boolean),
        types,
      },
    };
  });

  return {
    provider: 'complyadvantage',
    providerSearchId: searchId,
    resultCode: matches.length === 0 ? 'clear' : 'match',
    matches,
    rawResponse: data,
  };
}

function canonicalListCode(sourceName: string): string {
  const n = sourceName.toLowerCase();
  if (n.includes('ofac') || n.includes('sdn')) return 'OFAC-SDN';
  if (n.includes('eu') && (n.includes('cfsp') || n.includes('sanction'))) return 'EU-CFSP';
  if (n.includes('un') || n.includes('1267')) return 'UN-1267';
  if (n.includes('hmt') || (n.includes('uk') && n.includes('sanction'))) return 'HMT-UK';
  if (n.includes('pep')) return 'PEP';
  if (n.includes('adverse')) return 'adverse-media';
  return sourceName;
}

function severityFromScore(score: unknown): SanctionsSeverity {
  if (typeof score !== 'number') return 'unknown';
  if (score >= 0.85) return 'high';
  if (score >= 0.65) return 'medium';
  if (score >= 0.4) return 'low';
  return 'unknown';
}
