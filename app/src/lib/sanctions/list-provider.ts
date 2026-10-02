/**
 * Sanctions screening against the official published lists — no vendor account.
 *
 * Sources (all public, fetched over HTTPS from the issuing bodies):
 *   - OFAC Specially Designated Nationals (SDN.CSV + ALT.CSV)
 *   - OFAC non-SDN Consolidated list (CONS_PRIM.CSV + CONS_ALT.CSV)
 *   - UN Security Council Consolidated list (consolidated.xml)
 *
 * What a result means. `match`: at least one listed name resembles the subject and a
 * person must look (the KYB review blocks the approval and queues it for the Sentinel).
 * `clear`: no name on THOSE THREE LISTS resembles the subject — nothing more. It is not
 * a statement about the EU or UK lists, politically exposed persons or adverse media,
 * and names are all it compares. Every result records this coverage, the exact lists
 * consulted (size and SHA-256 of each file) and when they were loaded, so a "clear" can
 * be traced to the data behind it.
 *
 * Fail-closed. If any list cannot be loaded and there is no recent copy, the result is
 * `error`, never `clear`: a screening against a partial set is not a screening. A copy up
 * to 7 days old stands in when a refresh fails, and the result says it is stale.
 */

import { createHash } from 'node:crypto';
import {
  NameIndex,
  normalizeName,
  parseOfac,
  parseUnConsolidated,
  type ListEntry,
  type NameMatch,
} from './name-matching.ts';
import type {
  SanctionsMatch,
  SanctionsProvider,
  SanctionsScreeningResult,
  SanctionsSeverity,
  SanctionsSubject,
} from './provider.ts';

const OFAC = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports';
const UN_XML = 'https://scsanctions.un.org/resources/xml/en/consolidated.xml';

export const LIST_SOURCES = [
  { key: 'ofac-sdn', url: `${OFAC}/SDN.CSV` },
  { key: 'ofac-sdn-alt', url: `${OFAC}/ALT.CSV` },
  { key: 'ofac-cons', url: `${OFAC}/CONS_PRIM.CSV` },
  { key: 'ofac-cons-alt', url: `${OFAC}/CONS_ALT.CSV` },
  { key: 'un-consolidated', url: UN_XML },
] as const;

export const COVERAGE =
  'OFAC SDN, OFAC non-SDN consolidated and UN Security Council consolidated lists; names only. ' +
  'Not covered: EU and UK lists, PEP status, adverse media, dates of birth, nationalities, addresses.';

export const FRESH_MS = 6 * 3600_000;
export const STALE_LIMIT_MS = 7 * 24 * 3600_000;

export interface LoadedLists {
  index: NameIndex;
  loadedAt: number;
  files: Array<{ key: string; url: string; bytes: number; sha256: string }>;
}

let cache: LoadedLists | null = null;

/** For tests: drop the in-memory copy. */
export function resetListCache(): void {
  cache = null;
}

async function download(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { accept: '*/*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export interface LoadOptions {
  fetchImpl?: typeof fetch;
  nowMs?: number;
  timeoutMs?: number;
}

/** Load (or reuse) the combined index. Throws when no complete, recent set is available. */
export async function loadLists(opts: LoadOptions = {}): Promise<{ lists: LoadedLists; stale: boolean }> {
  const now = opts.nowMs ?? Date.now();
  if (cache && now - cache.loadedAt < FRESH_MS) return { lists: cache, stale: false };

  const f = opts.fetchImpl ?? fetch;
  try {
    const texts = await Promise.all(LIST_SOURCES.map((s) => download(s.url, f, opts.timeoutMs ?? 45_000)));
    const [sdn, sdnAlt, cons, consAlt, un] = texts;
    const entries: ListEntry[] = [
      ...parseOfac(sdn, sdnAlt, 'OFAC-SDN'),
      ...parseOfac(cons, consAlt, 'OFAC-CONS'),
      ...parseUnConsolidated(un),
    ];
    // A set that parsed to almost nothing is a changed format or a bad download, not a clean list.
    if (entries.length < 1000) throw new Error(`implausibly small list set (${entries.length} names)`);
    cache = {
      index: new NameIndex(entries),
      loadedAt: now,
      files: LIST_SOURCES.map((s, i) => ({
        key: s.key,
        url: s.url,
        bytes: Buffer.byteLength(texts[i], 'utf8'),
        sha256: createHash('sha256').update(texts[i]).digest('hex'),
      })),
    };
    return { lists: cache, stale: false };
  } catch (err) {
    if (cache && now - cache.loadedAt < STALE_LIMIT_MS) return { lists: cache, stale: true };
    throw err;
  }
}

function severityOf(score: number): SanctionsSeverity {
  if (score >= 0.97) return 'high';
  if (score >= 0.93) return 'medium';
  return 'low';
}

function toMatch(m: NameMatch): SanctionsMatch {
  const e = m.entry;
  return {
    providerMatchId: `${e.list}:${e.id}`,
    matchedName: e.aliasOf ?? e.name,
    sanctionsList: e.list,
    severity: severityOf(m.score),
    matchScore: Math.round(m.score * 1000) / 1000,
    evidence: {
      listedAs: e.name,
      via: e.aliasOf ? 'alias' : 'primary name',
      kind: e.kind,
      program: e.program,
      rule: m.rule,
    },
  };
}

export class OfacListSanctionsProvider implements SanctionsProvider {
  readonly name = 'ofac-list' as const;
  private readonly opts: LoadOptions;

  constructor(opts: LoadOptions = {}) {
    this.opts = opts;
  }

  async screen(subject: SanctionsSubject): Promise<SanctionsScreeningResult> {
    if (normalizeName(subject.name).length === 0) {
      // Nothing comparable (e.g. a name in a non-Latin script): never "clear".
      return {
        provider: 'ofac-list',
        resultCode: 'error',
        matches: [],
        errorMessage: 'name has no Latin letters or digits; screen it manually against the original-script lists',
      };
    }
    let loaded: { lists: LoadedLists; stale: boolean };
    try {
      loaded = await loadLists(this.opts);
    } catch (err) {
      return {
        provider: 'ofac-list',
        resultCode: 'error',
        matches: [],
        errorMessage: `sanctions lists unavailable: ${err instanceof Error ? err.message.slice(0, 160) : 'error'}`,
      };
    }
    const matches = loaded.lists.index.search(subject.name).map(toMatch);
    return {
      provider: 'ofac-list',
      providerSearchId: `lists-${new Date(loaded.lists.loadedAt).toISOString()}`,
      resultCode: matches.length > 0 ? 'match' : 'clear',
      matches,
      rawResponse: {
        coverage: COVERAGE,
        namesIndexed: loaded.lists.index.size,
        listsLoadedAt: new Date(loaded.lists.loadedAt).toISOString(),
        stale: loaded.stale,
        files: loaded.lists.files,
        screenedName: subject.name,
      },
    };
  }
}
