/**
 * Sanctions list parsing and name matching — pure, no network, no framework.
 *
 * The data are the official lists: OFAC's SDN list and its non-SDN consolidated list
 * (CSV) and the UN Security Council consolidated list (XML). This module turns them
 * into one searchable index and answers "which listed names resemble this name".
 *
 * Posture: it is built to over-report, never to under-report. A candidate goes to a
 * person (the Sentinel queue); a missed listed name is the failure that matters. So
 * the match rules favour recall — token order is ignored, corporate suffixes are
 * dropped, accents are folded, typos within a token are tolerated — and every
 * candidate carries its score and the list it came from. A name with nothing to
 * compare (no Latin letters) is NOT reported as clear: the caller must treat it as
 * unscreenable.
 *
 * It matches names only. It does not use dates of birth, nationalities or addresses,
 * and it does not know the EU or UK lists, PEP status or adverse media.
 */

export type SanctionsListCode = 'OFAC-SDN' | 'OFAC-CONS' | 'UN-SC';
export type ListedKind = 'entity' | 'individual' | 'vessel' | 'aircraft';

export interface ListEntry {
  /** Stable id on its list (OFAC ent_num, UN reference number or data id). */
  id: string;
  list: SanctionsListCode;
  /** The name as listed (primary name, or the alias that matched). */
  name: string;
  /** Set when `name` is an alias: the primary listed name. */
  aliasOf?: string;
  kind: ListedKind;
  /** Sanctions programme(s) or committee, as published. */
  program: string;
}

export interface NameMatch {
  entry: ListEntry;
  /** 0..1. */
  score: number;
  /** Which rule produced the match, for the reviewer. */
  rule: 'query-in-entry' | 'entry-in-query' | 'single-token' | 'distinctive-token';
}

// ─── CSV ─────────────────────────────────────────────────────────────────────
/** RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF. OFAC's `-0-` is null. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((v) => (v.trim() === '-0-' ? '' : v.trim())));
}

function kindOf(type: string): ListedKind {
  const t = type.toLowerCase();
  if (t === 'individual') return 'individual';
  if (t === 'vessel') return 'vessel';
  if (t === 'aircraft') return 'aircraft';
  return 'entity';
}

/**
 * OFAC primary file (SDN.CSV or CONS_PRIM.CSV): ent_num, name, type, program, ...
 * plus its alias file (ALT.CSV or CONS_ALT.CSV): ent_num, alt_num, alt_type, alt_name.
 */
export function parseOfac(primaryCsv: string, aliasCsv: string, list: 'OFAC-SDN' | 'OFAC-CONS'): ListEntry[] {
  const entries: ListEntry[] = [];
  const byId = new Map<string, ListEntry>();
  for (const r of parseCsv(primaryCsv)) {
    if (r.length < 4 || !r[0] || !r[1]) continue;
    const e: ListEntry = { id: r[0], list, name: r[1], kind: kindOf(r[2] ?? ''), program: r[3] ?? '' };
    entries.push(e);
    byId.set(e.id, e);
  }
  for (const r of parseCsv(aliasCsv)) {
    if (r.length < 4 || !r[0] || !r[3]) continue;
    const primary = byId.get(r[0]);
    if (!primary) continue;
    entries.push({ id: primary.id, list, name: r[3], aliasOf: primary.name, kind: primary.kind, program: primary.program });
  }
  return entries;
}

// ─── UN consolidated list (XML) ──────────────────────────────────────────────
function xmlText(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(block);
  return m ? xmlText(m[1]) : '';
}

/** UN Security Council consolidated list: <INDIVIDUAL> and <ENTITY> blocks with aliases. */
export function parseUnConsolidated(xml: string): ListEntry[] {
  const entries: ListEntry[] = [];
  const blockRe = /<(INDIVIDUAL|ENTITY)>([\s\S]*?)<\/\1>/g;
  for (let m = blockRe.exec(xml); m; m = blockRe.exec(xml)) {
    const isIndividual = m[1] === 'INDIVIDUAL';
    const block = m[2];
    const id = tag(block, 'REFERENCE_NUMBER') || tag(block, 'DATAID');
    const name = (isIndividual
      ? [tag(block, 'FIRST_NAME'), tag(block, 'SECOND_NAME'), tag(block, 'THIRD_NAME'), tag(block, 'FOURTH_NAME')]
      : [tag(block, 'FIRST_NAME')]
    )
      .filter(Boolean)
      .join(' ');
    if (!id || !name) continue;
    const program = tag(block, 'UN_LIST_TYPE') || 'UN Security Council';
    const kind: ListedKind = isIndividual ? 'individual' : 'entity';
    entries.push({ id, list: 'UN-SC', name, kind, program });
    const aliasRe = /<ALIAS_NAME>([^<]+)<\/ALIAS_NAME>/g;
    for (let a = aliasRe.exec(block); a; a = aliasRe.exec(block)) {
      const alias = xmlText(a[1]);
      if (alias) entries.push({ id, list: 'UN-SC', name: alias, aliasOf: name, kind, program });
    }
  }
  return entries;
}

// ─── Normalisation and similarity ────────────────────────────────────────────
const STOPWORDS = new Set([
  'THE', 'OF', 'AND', 'LTD', 'LIMITED', 'LLC', 'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO',
  'COMPANY', 'PLC', 'SA', 'SAS', 'SARL', 'GMBH', 'AG', 'BV', 'NV', 'SRL', 'SPA', 'LP', 'LLP',
  'PTE', 'PVT', 'BHD', 'KG', 'OY', 'AB', 'AS', 'DE', 'DI', 'DEL', 'LA', 'LE', 'EL', 'FZE', 'FZCO', 'FZ',
]);

/**
 * Words too common in company names to identify anyone on their own. They still take part
 * in ordinary matching; they just cannot make a match by themselves.
 */
const GENERIC_WORDS = new Set([
  'HOLDINGS', 'HOLDING', 'GROUP', 'INTERNATIONAL', 'TRADING', 'ENTERPRISES', 'ENTERPRISE',
  'INDUSTRIES', 'INDUSTRIAL', 'INVESTMENT', 'INVESTMENTS', 'SERVICES', 'GLOBAL', 'CAPITAL',
  'PARTNERS', 'MANAGEMENT', 'FINANCIAL', 'TECHNOLOGY', 'TECHNOLOGIES', 'COMPANY', 'CORPORATION',
  'NATIONAL', 'FOUNDATION', 'ORGANIZATION', 'ORGANISATION', 'COMMERCIAL', 'PETROLEUM', 'ENERGY',
  'SHIPPING', 'TRANSPORT', 'LOGISTICS', 'CONSTRUCTION', 'ENGINEERING', 'ELECTRONICS',
  'CONSULTING', 'SOLUTIONS', 'SYSTEMS', 'ASSOCIATION', 'UNIVERSITY', 'INSTITUTE', 'REINSURANCE',
  'INSURANCE', 'ASSURANCE', 'PROPERTIES', 'DEVELOPMENT', 'MARITIME',
]);

/** Upper-case, accent-folded, punctuation-free tokens, with corporate suffixes dropped. */
export function normalizeName(raw: string): string[] {
  const s = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    // dotted initials and suffixes: S.A. -> SA, L.L.C. -> LLC
    .replace(/\b([A-Z])\.(?=[A-Z](?:\.|\b))/g, '$1')
    // apostrophes join, they do not split: QA'IDA -> QAIDA
    .replace(/['\u2019`]/g, '')
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  if (!s) return [];
  const tokens = s.split(' ');
  const kept = tokens.filter((t) => !STOPWORDS.has(t));
  return kept.length > 0 ? kept : tokens;
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const range = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const am: boolean[] = new Array(la).fill(false);
  const bm: boolean[] = new Array(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, lb);
    for (let j = lo; j < hi; j++) {
      if (!bm[j] && a[i] === b[j]) {
        am[i] = true;
        bm[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < la; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro = (matches / la + matches / lb + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < la && prefix < lb && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Per-token similarity needed for a token to count as "the same word". */
const TOKEN_SIMILAR = 0.88;
/** Weakest single token allowed inside an otherwise matching name. */
const TOKEN_FLOOR = 0.85;
/** Average token similarity needed for a multi-token match. */
const NAME_THRESHOLD = 0.92;
const MAX_MATCHES = 10;

/** A long, uncommon word: enough to flag a match on its own. */
function isDistinctive(token: string): boolean {
  return token.length >= 7 && !GENERIC_WORDS.has(token);
}

/**
 * Similarity of two tokens. Very short tokens ("RE", "OY", "AL") are noise to a fuzzy
 * comparison — "RE" resembles "REZA" — so they count only when identical.
 */
function tokenSim(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length <= 3 || b.length <= 3) return 0;
  return jaroWinkler(a, b);
}

export class NameIndex {
  private readonly entries: ListEntry[];
  private readonly tokens: string[][];
  private readonly vocabulary = new Map<string, number[]>();

  constructor(entries: ListEntry[]) {
    this.entries = entries;
    this.tokens = entries.map((e) => normalizeName(e.name));
    this.tokens.forEach((toks, i) => {
      for (const t of new Set(toks)) {
        const bucket = this.vocabulary.get(t);
        if (bucket) bucket.push(i);
        else this.vocabulary.set(t, [i]);
      }
    });
  }

  get size(): number {
    return this.entries.length;
  }

  /** Listed names that resemble `name`, best first. Empty array = nothing resembles it. */
  search(name: string): NameMatch[] {
    const q = normalizeName(name);
    if (q.length === 0) throw new Error('name has no Latin letters or digits to compare');

    // Candidates: any entry holding a token close to any query token.
    const candidates = new Set<number>();
    for (const qt of q) {
      for (const [vt, idx] of this.vocabulary) {
        if (Math.abs(vt.length - qt.length) > 3) continue;
        if (tokenSim(qt, vt) >= TOKEN_SIMILAR) for (const i of idx) candidates.add(i);
      }
    }

    const best = new Map<string, NameMatch>();
    for (const i of candidates) {
      const e = this.tokens[i];
      const m = this.score(q, e, this.entries[i]);
      if (!m) continue;
      const key = `${m.entry.list}:${m.entry.id}`;
      const prior = best.get(key);
      if (!prior || m.score > prior.score) best.set(key, m);
    }
    return [...best.values()].sort((x, y) => y.score - x.score).slice(0, MAX_MATCHES);
  }

  private score(q: string[], e: string[], entry: ListEntry): NameMatch | null {
    // How well every word of `from` is found in `to`. Generic company words weigh a
    // quarter of an identifying word: agreeing on "GROUP" is not agreeing on a name.
    const explained = (from: string[], to: string[]) => {
      let sum = 0;
      let weights = 0;
      let floor = 1;
      for (const a of from) {
        let top = 0;
        for (const b of to) {
          const sim = tokenSim(a, b);
          if (sim > top) top = sim;
        }
        const w = GENERIC_WORDS.has(a) ? 0.25 : 1;
        sum += top * w;
        weights += w;
        if (top < floor) floor = top;
      }
      return { mean: sum / weights, floor };
    };

    if (q.length === 1 && e.length === 1) {
      const s = tokenSim(q[0], e[0]);
      return s >= 0.95 ? { entry, score: s, rule: 'single-token' } : null;
    }
    // One distinctive word against a longer listed name: only an exact, long word counts.
    if (q.length === 1) {
      return isDistinctive(q[0]) && e.includes(q[0]) ? { entry, score: 0.9, rule: 'distinctive-token' } : null;
    }

    // The reverse: a listed one-word name inside a longer applicant name.
    if (e.length === 1) {
      return isDistinctive(e[0]) && q.includes(e[0]) ? { entry, score: 0.9, rule: 'distinctive-token' } : null;
    }

    let best: NameMatch | null = null;
    const qe = explained(q, e);
    if (qe.floor >= TOKEN_FLOOR && qe.mean >= NAME_THRESHOLD) {
      best = { entry, score: qe.mean, rule: 'query-in-entry' };
    }
    if (e.length >= 2) {
      const eq = explained(e, q);
      if (eq.floor >= TOKEN_FLOOR && eq.mean >= NAME_THRESHOLD && (!best || eq.mean > best.score)) {
        best = { entry, score: eq.mean, rule: 'entry-in-query' };
      }
    }
    return best;
  }
}
