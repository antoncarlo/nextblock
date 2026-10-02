/**
 * Sanctions list screening smoke (no network).
 *
 *   node --experimental-strip-types app/scripts/sanctions-list-smoke.ts
 *
 * Parsing of the published formats (OFAC CSV, UN XML), the name-matching rules, and the
 * provider's loading, caching and fail-closed behaviour — against fixtures written in the
 * exact shape of the real files. The listed names used here are long-published public
 * entries. The production data are fetched by the provider, not stored in the repo.
 */

import {
  NameIndex,
  jaroWinkler,
  normalizeName,
  parseCsv,
  parseOfac,
  parseUnConsolidated,
} from '../src/lib/sanctions/name-matching.ts';
import {
  COVERAGE,
  FRESH_MS,
  LIST_SOURCES,
  OfacListSanctionsProvider,
  STALE_LIMIT_MS,
  resetListCache,
} from '../src/lib/sanctions/list-provider.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

// ── fixtures in the real file shapes ─────────────────────────────────────────
const N = '-0- ';
const sdnRow = (id: number, name: string, type: string, program: string) =>
  `${id},"${name}",${type ? `"${type}"` : N},"${program}",${N},${N},${N},${N},${N},${N},${N},${N}`;

const filler: string[] = [];
for (let i = 0; i < 1100; i++) filler.push(sdnRow(100000 + i, `ZQX${i}VRT HOLDINGS`, '', 'TESTFILL'));

const SDN = [
  sdnRow(306, 'BANCO NACIONAL DE CUBA', '', 'CUBA'),
  sdnRow(9001, 'ABU TEIR, Mohammed', 'individual', 'SDGT'),
  sdnRow(9002, 'PETROLEOS DE VENEZUELA, S.A.', '', 'VENEZUELA-EO13850'),
  sdnRow(9003, 'ROSOBORONEXPORT', '', 'UKRAINE-EO13662'),
  sdnRow(9004, 'AL-QA\'IDA', '', 'SDGT'),
  sdnRow(9005, 'VESSEL TESTSHIP', 'vessel', 'IRAN'),
  ...filler,
].join('\r\n');
const SDN_ALT = ['306,220,"aka","NATIONAL BANK OF CUBA",-0- ', '9001,5,"aka","ABOU TAYR, Mohammad",-0- '].join('\r\n');
const CONS = [sdnRow(9640, 'ABU TEIR, Mohammed', 'individual', 'NS-PLC')].join('\r\n');
const CONS_ALT = '';
const UN_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<CONSOLIDATED_LIST dateGenerated="2026-09-30T00:00:00.000Z">
  <INDIVIDUALS>
    <INDIVIDUAL>
      <DATAID>690001</DATAID>
      <FIRST_NAME>Sylvestre</FIRST_NAME>
      <SECOND_NAME>Mudacumura</SECOND_NAME>
      <THIRD_NAME/>
      <UN_LIST_TYPE>DRC</UN_LIST_TYPE>
      <REFERENCE_NUMBER>CDi.001</REFERENCE_NUMBER>
      <INDIVIDUAL_ALIAS><QUALITY>Good</QUALITY><ALIAS_NAME>Radja Octavien</ALIAS_NAME></INDIVIDUAL_ALIAS>
    </INDIVIDUAL>
  </INDIVIDUALS>
  <ENTITIES>
    <ENTITY>
      <DATAID>690002</DATAID>
      <FIRST_NAME>Smith &amp; Sons Trading</FIRST_NAME>
      <UN_LIST_TYPE>Al-Qaida</UN_LIST_TYPE>
      <REFERENCE_NUMBER>QDe.099</REFERENCE_NUMBER>
      <ENTITY_ALIAS><QUALITY>Low</QUALITY><ALIAS_NAME>S&amp;S Commerce</ALIAS_NAME></ENTITY_ALIAS>
    </ENTITY>
  </ENTITIES>
</CONSOLIDATED_LIST>`;

// ── CSV and format parsers ───────────────────────────────────────────────────
{
  const rows = parseCsv('306,"BANCO, NACIONAL ""X""",-0- ,"CUBA"\r\n7,"B",-0- ,"Z"\n');
  check('csv: quoted comma stays in one field', rows[0][1] === 'BANCO, NACIONAL "X"');
  check('csv: -0- becomes empty', rows[0][2] === '');
  check('csv: CRLF and LF both split rows', rows.length === 2 && rows[1][0] === '7');

  const entries = parseOfac(SDN, SDN_ALT, 'OFAC-SDN');
  check('ofac: primaries and aliases parsed', entries.length === 6 + 1100 + 2);
  const alias = entries.find((e) => e.aliasOf === 'BANCO NACIONAL DE CUBA');
  check('ofac: alias points at its primary', alias?.name === 'NATIONAL BANK OF CUBA' && alias.id === '306');
  check('ofac: kind and programme kept', entries.find((e) => e.id === '9005')?.kind === 'vessel' && entries.find((e) => e.id === '9001')?.program === 'SDGT');

  const un = parseUnConsolidated(UN_XML);
  check('un: individual names joined, alias parsed', un.some((e) => e.name === 'Sylvestre Mudacumura') && un.some((e) => e.aliasOf === 'Sylvestre Mudacumura'));
  check('un: entity name decodes &amp;', un.some((e) => e.name === 'Smith & Sons Trading' && e.kind === 'entity'));
  check('un: reference number is the id', un.some((e) => e.id === 'QDe.099'));
}

// ── normalisation and similarity ─────────────────────────────────────────────
{
  check('normalize: accents, case, punctuation, suffix', normalizeName("Abû Tèir, Mohammed S.A.").join(' ') === 'ABU TEIR MOHAMMED');
  check('normalize: ampersand is AND and dropped', normalizeName('Smith & Sons').join(' ') === 'SMITH SONS');
  check('normalize: a name that is only suffixes keeps its tokens', normalizeName('The Company').length > 0);
  check('normalize: non-Latin script yields nothing to compare', normalizeName('中国银行').length === 0);
  check('jaro-winkler: identical', jaroWinkler('CUBA', 'CUBA') === 1);
  check('jaro-winkler: classic pair MARTHA/MARHTA', Math.abs(jaroWinkler('MARTHA', 'MARHTA') - 0.9611) < 0.001);
  check('jaro-winkler: unrelated words are low', jaroWinkler('CANADA', 'CUBA') < 0.8);
}

// ── matching ─────────────────────────────────────────────────────────────────
const index = new NameIndex([...parseOfac(SDN, SDN_ALT, 'OFAC-SDN'), ...parseOfac(CONS, CONS_ALT, 'OFAC-CONS'), ...parseUnConsolidated(UN_XML)]);
const hit = (q: string) => index.search(q);
const names = (q: string) => hit(q).map((m) => m.entry.aliasOf ?? m.entry.name);
{
  check('match: exact listed name', names('Banco Nacional de Cuba').includes('BANCO NACIONAL DE CUBA'));
  check('match: with a corporate suffix', names('BANCO NACIONAL DE CUBA S.A.').includes('BANCO NACIONAL DE CUBA'));
  check('match: through an alias', names('National Bank of Cuba').includes('BANCO NACIONAL DE CUBA'));
  check('match: a typo inside a word', names('Banko Nacional de Cuba').includes('BANCO NACIONAL DE CUBA'));
  check('match: a longer applicant name containing the listed one', names('Banco Nacional de Cuba Trading Group').includes('BANCO NACIONAL DE CUBA'));
  check('match: individual, reversed order', names('Mohammed Abu Teir').includes('ABU TEIR, Mohammed'));
  check('match: individual, accents', names('Abû Tèir Mohammed').includes('ABU TEIR, Mohammed'));
  check('match: individual, alias spelling', names('Mohammad Abou Tayr').includes('ABU TEIR, Mohammed'));
  check('match: the same person on two lists keeps both entries', hit('Mohammed Abu Teir').some((m) => m.entry.list === 'OFAC-CONS') && hit('Mohammed Abu Teir').some((m) => m.entry.list === 'OFAC-SDN'));
  check('match: a one-word listed name inside a longer name', names('Rosoboronexport Trading').includes('ROSOBORONEXPORT'));
  check('match: a one-word query that is a distinctive listed word', names('Rosoboronexport').includes('ROSOBORONEXPORT'));
  check('match: transliteration with punctuation', names('Al Qaida').length > 0 || names("Al-Qa'ida").length > 0);
  check('match: UN list individual', names('Mudacumura Sylvestre').includes('Sylvestre Mudacumura'));
  check('match: UN list alias of an entity', names('S&S Commerce').includes('Smith & Sons Trading'));
  check('match: every candidate carries a score between 0 and 1', hit('Banco Nacional de Cuba').every((m) => m.score > 0 && m.score <= 1));
  check('match: best candidate first', (() => { const r = hit('Banco Nacional de Cuba'); return r.every((m, i) => i === 0 || r[i - 1].score >= m.score); })());
}
{
  check('no match: an unrelated company', hit('Anthropic PBC').length === 0);
  check('no match: a plausible reinsurer name', hit('Nextblock Reinsurance Partners Ltd').length === 0);
  check('no match: shares generic words only', hit('National Bank of Canada').length === 0);
  check('no match: one generic word', hit('Holdings').length === 0);
  check('no match: a short unrelated word', hit('Cuba').length === 0);
  let threw = false;
  try {
    hit('中国银行');
  } catch {
    threw = true;
  }
  check('search refuses a name it cannot compare', threw);
}

// ── provider: loading, caching, failing closed ───────────────────────────────
const bodies: Record<string, string> = {
  'ofac-sdn': SDN,
  'ofac-sdn-alt': SDN_ALT,
  'ofac-cons': CONS,
  'ofac-cons-alt': CONS_ALT,
  'un-consolidated': UN_XML,
};
const urlToKey = new Map<string, string>(LIST_SOURCES.map((s) => [s.url, s.key]));
let calls = 0;
const okFetch = (async (url: unknown) => {
  calls += 1;
  return new Response(bodies[urlToKey.get(String(url)) ?? ''] ?? '', { status: 200 });
}) as typeof fetch;
const T0 = 1_790_000_000_000;

{
  resetListCache();
  const p = new OfacListSanctionsProvider({ fetchImpl: okFetch, nowMs: T0 });
  const r = await p.screen({ kind: 'entity', name: 'Banco Nacional de Cuba S.A.' });
  check('provider: listed entity -> match', r.resultCode === 'match' && r.provider === 'ofac-list');
  check('provider: match names the list and id', r.matches[0].providerMatchId.startsWith('OFAC-SDN:306') && r.matches[0].sanctionsList === 'OFAC-SDN');
  check('provider: match shows how it matched', r.matches[0].evidence?.via === 'primary name' && typeof r.matches[0].matchScore === 'number');
  check('provider: coverage is stated on the result', r.rawResponse?.coverage === COVERAGE);
  const files = r.rawResponse?.files as Array<{ key: string; sha256: string; bytes: number }>;
  check('provider: every list consulted is recorded with its hash', files.length === 5 && files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)));
  check('provider: five downloads for the first call', calls === 5);

  const c = await p.screen({ kind: 'entity', name: 'Anthropic PBC' });
  check('provider: unrelated entity -> clear', c.resultCode === 'clear' && c.matches.length === 0);
  check('provider: second call reuses the loaded lists', calls === 5);

  const e = await p.screen({ kind: 'entity', name: '中国银行' });
  check('provider: a name it cannot compare is an error, not clear', e.resultCode === 'error');
}
{
  // Refresh after the cache goes stale; the source is down.
  const down = (async () => new Response('bad gateway', { status: 502 })) as typeof fetch;
  const p = new OfacListSanctionsProvider({ fetchImpl: down, nowMs: T0 + FRESH_MS + 1000 });
  const r = await p.screen({ kind: 'entity', name: 'Banco Nacional de Cuba' });
  check('provider: source down, recent copy -> still screens, marked stale', r.resultCode === 'match' && r.rawResponse?.stale === true);
  const old = new OfacListSanctionsProvider({ fetchImpl: down, nowMs: T0 + STALE_LIMIT_MS + 1000 });
  const r2 = await old.screen({ kind: 'entity', name: 'Anthropic PBC' });
  check('provider: source down, copy too old -> error, never clear', r2.resultCode === 'error' && r2.matches.length === 0);
}
{
  resetListCache();
  const down = (async () => new Response('', { status: 503 })) as typeof fetch;
  const r = await new OfacListSanctionsProvider({ fetchImpl: down, nowMs: T0 }).screen({ kind: 'entity', name: 'Anthropic PBC' });
  check('provider: no lists at all -> error', r.resultCode === 'error');

  resetListCache();
  const oneBad = (async (url: unknown) =>
    urlToKey.get(String(url)) === 'un-consolidated'
      ? new Response('', { status: 500 })
      : new Response(bodies[urlToKey.get(String(url)) ?? ''] ?? '')) as typeof fetch;
  const r2 = await new OfacListSanctionsProvider({ fetchImpl: oneBad, nowMs: T0 }).screen({ kind: 'entity', name: 'Anthropic PBC' });
  check('provider: one list missing -> error (a partial set is not a screening)', r2.resultCode === 'error');

  resetListCache();
  const tiny = (async () => new Response('1,"ONLY ONE",-0- ,"X"')) as typeof fetch;
  const r3 = await new OfacListSanctionsProvider({ fetchImpl: tiny, nowMs: T0 }).screen({ kind: 'entity', name: 'Anthropic PBC' });
  check('provider: a download that parses to almost nothing -> error', r3.resultCode === 'error');

  resetListCache();
  const hang = ((_u: unknown, init?: RequestInit) =>
    new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
  const r4 = await new OfacListSanctionsProvider({ fetchImpl: hang, nowMs: T0, timeoutMs: 40 }).screen({ kind: 'entity', name: 'Anthropic PBC' });
  check('provider: a download that hangs -> error', r4.resultCode === 'error');
}
resetListCache();

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
