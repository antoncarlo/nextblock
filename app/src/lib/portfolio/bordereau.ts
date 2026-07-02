/**
 * Bordereau parser + aggregator (pure, dependency-light — viem-free).
 *
 * A bordereau is the line-by-line schedule of the underlying policies in a
 * ceded portfolio. This module turns a CSV export of that schedule into the
 * PORTFOLIO-level figures the on-chain submission needs — it never puts a
 * single policy row on-chain, it derives the aggregate the cedant would
 * otherwise total by hand.
 *
 * Consumed by the PortfolioPanel UI (client) and the node --experimental-strip-
 * types smoke, so no React / no server / no heavy deps. Excel users export
 * their sheet as CSV (File → Save As → CSV) — the universal bordereau
 * interchange format.
 */

/** Portfolio-level aggregate ready to prefill the submission form. */
export interface BordereauSummary {
  policyCount: number;
  /** Human USDC units (e.g. "250000000.00") — sum of sum-insured / coverage. */
  coverageLimit: string;
  /** Human USDC units — sum of ceded premium. */
  cededPremium: string;
  /** Earliest inception across rows (yyyy-mm-dd). */
  inceptionDate: string;
  /** Latest expiry across rows (yyyy-mm-dd). */
  expiryDate: string;
  /** Most frequent non-empty line of business. */
  lineOfBusiness: string;
  /** Most frequent non-empty jurisdiction. */
  jurisdiction: string;
  /** Non-fatal issues: missing columns, unparseable cells, ambiguous dates. */
  warnings: string[];
}

export type BordereauResult = { ok: true; summary: BordereauSummary } | { ok: false; errors: string[] };

/** Header aliases (lowercased, punctuation-stripped) → canonical field. */
const COLUMN_ALIASES: Record<string, string[]> = {
  coverage: [
    'suminsured', 'sumassured', 'sominsured', 'coverage', 'coveragelimit', 'limit', 'tsi',
    'insuredvalue', 'insuredamount', 'totalsuminsured', 'exposure',
  ],
  premium: [
    'premium', 'cededpremium', 'grosspremium', 'writtenpremium', 'premiumamount', 'netpremium',
    'annualpremium',
  ],
  inception: ['inception', 'inceptiondate', 'effective', 'effectivedate', 'start', 'startdate', 'from', 'periodfrom', 'attachment', 'attachmentdate'],
  expiry: ['expiry', 'expirydate', 'expiration', 'expirationdate', 'end', 'enddate', 'to', 'periodto', 'maturity', 'maturitydate'],
  lob: ['lineofbusiness', 'lob', 'class', 'classofbusiness', 'peril', 'product', 'coveragetype', 'riskclass'],
  jurisdiction: ['jurisdiction', 'country', 'territory', 'region', 'domicile', 'location', 'countryofrisk'],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** RFC-4180-ish CSV → rows of cells (handles quotes, embedded commas/newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/^﻿/, ''); // strip BOM

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim().length > 0));
}

/** "$250,000,000.50" / "1.234.567,89" / "25,000" / "(1,000)" → number | null.
 *  Resolves the US/EU grouping-vs-decimal ambiguity: with both separators the
 *  LAST one is the decimal; with only commas (or only dots) a lone separator
 *  followed by exactly 3 digits, or any repeated separator, is grouping. */
export function parseAmount(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const negative = /^\(.*\)$/.test(t) || t.startsWith('-');
  const s = t.replace(/[()]/g, '').replace(/[^0-9.,]/g, '');
  if (s === '') return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  let normalized: string;

  if (hasComma && hasDot) {
    normalized =
      s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(/,/g, '.') // dots group, comma decimal (EU)
        : s.replace(/,/g, ''); // commas group, dot decimal (US)
  } else if (hasComma) {
    const parts = s.split(',');
    const grouping = parts.length > 2 || (parts.length === 2 && parts[1].length === 3);
    normalized = grouping ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (hasDot) {
    // Multiple dots can only be grouping; a single dot is treated as a decimal.
    normalized = s.split('.').length > 2 ? s.replace(/\./g, '') : s;
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** yyyy-mm-dd | dd/mm/yyyy | mm/dd/yyyy | Excel serial → yyyy-mm-dd | null. */
export function parseBordereauDate(raw: string): { iso: string; ambiguous: boolean } | null {
  const s = raw.trim();
  if (s === '') return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return { iso: `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`, ambiguous: false };

  const slash = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (slash) {
    let a = Number(slash[1]);
    let b = Number(slash[2]);
    let y = Number(slash[3]);
    if (y < 100) y += y < 70 ? 2000 : 1900;
    let ambiguous = false;
    // a=day,b=month by default (European); swap only when it is the only reading.
    if (a > 12 && b <= 12) { /* dd/mm */ } else if (b > 12 && a <= 12) { const t = a; a = b; b = t; } else if (a <= 12 && b <= 12) { ambiguous = true; }
    if (b < 1 || b > 12 || a < 1 || a > 31) return null;
    return { iso: `${y}-${pad(b)}-${pad(a)}`, ambiguous };
  }

  // Excel serial (days since 1899-12-30).
  if (/^\d{4,6}$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 90000) {
      const ms = (serial - 25569) * 86400 * 1000;
      const d = new Date(ms);
      return { iso: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, ambiguous: false };
    }
  }
  return null;
}

function pad(v: string | number): string {
  return String(v).padStart(2, '0');
}

function mode(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) {
    const t = v.trim();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
  return best;
}

function fmtUsdc(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Parse a bordereau CSV and derive the portfolio-level submission aggregate. */
export function summarizeBordereau(csvText: string): BordereauResult {
  return summarizeBordereauRows(parseCsv(csvText));
}

/** Aggregate pre-parsed rows (header + policy lines) from CSV or .xlsx. */
export function summarizeBordereauRows(rows: string[][]): BordereauResult {
  if (rows.length < 2) return { ok: false, errors: ['No data rows found (need a header row + at least one policy).'] };

  const header = rows[0].map(normalizeHeader);
  const colOf = (field: string): number => {
    const aliases = COLUMN_ALIASES[field];
    for (let i = 0; i < header.length; i++) if (aliases.includes(header[i])) return i;
    return -1;
  };

  const cov = colOf('coverage');
  const prem = colOf('premium');
  const inc = colOf('inception');
  const exp = colOf('expiry');
  const lobC = colOf('lob');
  const jurC = colOf('jurisdiction');

  const errors: string[] = [];
  if (cov === -1) errors.push('No sum-insured / coverage column found (tried e.g. "Sum Insured", "Coverage", "Limit").');
  if (prem === -1) errors.push('No premium column found (tried e.g. "Premium", "Ceded Premium").');
  if (errors.length > 0) return { ok: false, errors };

  const warnings: string[] = [];
  const data = rows.slice(1);
  let coverageTotal = 0;
  let premiumTotal = 0;
  let minInc: string | null = null;
  let maxExp: string | null = null;
  let ambiguousDates = 0;
  const lobs: string[] = [];
  const jurs: string[] = [];
  let badCoverage = 0;
  let badPremium = 0;

  for (let r = 0; r < data.length; r++) {
    const cell = (i: number) => (i >= 0 && i < data[r].length ? data[r][i] : '');
    const cAmt = parseAmount(cell(cov));
    if (cAmt === null) badCoverage++; else coverageTotal += cAmt;
    const pAmt = parseAmount(cell(prem));
    if (pAmt === null) badPremium++; else premiumTotal += pAmt;

    if (inc !== -1) {
      const d = parseBordereauDate(cell(inc));
      if (d) { if (d.ambiguous) ambiguousDates++; if (minInc === null || d.iso < minInc) minInc = d.iso; }
    }
    if (exp !== -1) {
      const d = parseBordereauDate(cell(exp));
      if (d) { if (d.ambiguous) ambiguousDates++; if (maxExp === null || d.iso > maxExp) maxExp = d.iso; }
    }
    if (lobC !== -1) lobs.push(cell(lobC));
    if (jurC !== -1) jurs.push(cell(jurC));
  }

  if (badCoverage > 0) warnings.push(`${badCoverage} row(s) had an unparseable coverage amount and were skipped.`);
  if (badPremium > 0) warnings.push(`${badPremium} row(s) had an unparseable premium and were skipped.`);
  if (inc === -1) warnings.push('No inception column found — set the inception date manually.');
  if (exp === -1) warnings.push('No expiry column found — set the expiry date manually.');
  if (ambiguousDates > 0) warnings.push(`${ambiguousDates} slashed date(s) were ambiguous; assumed DD/MM/YYYY — verify the dates.`);
  if (coverageTotal <= 0) warnings.push('Aggregate coverage is zero — check the coverage column.');
  if (premiumTotal <= 0) warnings.push('Aggregate premium is zero — check the premium column.');

  return {
    ok: true,
    summary: {
      policyCount: data.length,
      coverageLimit: fmtUsdc(coverageTotal),
      cededPremium: fmtUsdc(premiumTotal),
      inceptionDate: minInc ?? '',
      expiryDate: maxExp ?? '',
      lineOfBusiness: mode(lobs),
      jurisdiction: mode(jurs),
      warnings,
    },
  };
}
