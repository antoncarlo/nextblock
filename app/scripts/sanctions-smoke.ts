/**
 * Sanctions screening smoke checks.
 *
 *   node --experimental-strip-types app/scripts/sanctions-smoke.ts
 *
 * Scope: Mock provider behavior + pure normalization of ComplyAdvantage
 * response shapes. No network.
 */

import {
  MockSanctionsProvider,
  normalizeComplyAdvantage,
  type SanctionsScreeningResult,
} from '../src/lib/sanctions/provider.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

// --- Mock provider --------------------------------------------------------
const mock = new MockSanctionsProvider();

{
  const r = await mock.screen({ kind: 'entity', name: 'Generali SpA' });
  check('mock clean: result=clear', r.resultCode === 'clear');
  check('mock clean: no matches', r.matches.length === 0);
  check('mock clean: provider=mock', r.provider === 'mock');
}

{
  const r = await mock.screen({ kind: 'entity', name: 'Acme __SANCTION__ Ltd' });
  check('mock SDN match: result=match', r.resultCode === 'match');
  check('mock SDN match: 1 match', r.matches.length === 1);
  check('mock SDN match: list=OFAC-SDN', r.matches[0].sanctionsList === 'OFAC-SDN');
  check('mock SDN match: severity=high', r.matches[0].severity === 'high');
}

{
  const r = await mock.screen({ kind: 'individual', name: 'John __PEP__ Doe' });
  check('mock PEP: list=PEP', r.matches[0]?.sanctionsList === 'PEP');
  check('mock PEP: severity=medium', r.matches[0]?.severity === 'medium');
}

// --- normalizeComplyAdvantage --------------------------------------------

{
  const empty = normalizeComplyAdvantage({ content: { data: { id: 99, hits: [] } } });
  check('CA empty: clear', empty.resultCode === 'clear');
  check('CA empty: searchId preserved', empty.providerSearchId === '99');
}

{
  const payload = {
    content: {
      data: {
        id: 123,
        hits: [
          {
            id: 'hit-1',
            match_status: 'potential_match',
            score: 0.92,
            doc: {
              name: 'BAD ENTITY',
              sources: [{ name: 'OFAC SDN List' }],
              types: ['sanction'],
            },
          },
          {
            id: 'hit-2',
            match_status: 'potential_match',
            score: 0.7,
            doc: {
              name: 'POLITICAL PERSON',
              sources: [{ name: 'PEP database' }],
              types: ['pep'],
            },
          },
          {
            id: 'hit-3',
            score: 0.5,
            doc: { name: 'Misc news', sources: [{ name: 'BBC news' }], types: ['adverse-media'] },
          },
        ],
      },
    },
  };
  const r: SanctionsScreeningResult = normalizeComplyAdvantage(payload);
  check('CA non-empty: result=match', r.resultCode === 'match');
  check('CA non-empty: 3 matches', r.matches.length === 3);
  check('CA: OFAC source → OFAC-SDN canonical', r.matches[0].sanctionsList === 'OFAC-SDN');
  check('CA: high score → high severity', r.matches[0].severity === 'high');
  check('CA: PEP source → PEP canonical', r.matches[1].sanctionsList === 'PEP');
  check('CA: medium score → medium severity', r.matches[1].severity === 'medium');
  check('CA: BBC → kept as source name (other)', r.matches[2].sanctionsList === 'BBC news');
  check('CA: low score → low severity', r.matches[2].severity === 'low');
  check('CA: match ids preserved', r.matches[0].providerMatchId === 'hit-1');
  check('CA: evidence has match_status', (r.matches[0].evidence as { match_status?: string }).match_status === 'potential_match');
}

// Score boundaries.
{
  const at85 = normalizeComplyAdvantage({
    content: { data: { id: 1, hits: [{ id: 'x', score: 0.85, doc: { name: 'x', sources: [{ name: 'OFAC' }] } }] } },
  });
  check('CA: score 0.85 = high (boundary inclusive)', at85.matches[0].severity === 'high');
  const at65 = normalizeComplyAdvantage({
    content: { data: { id: 1, hits: [{ id: 'y', score: 0.65, doc: { name: 'y', sources: [{ name: 'OFAC' }] } }] } },
  });
  check('CA: score 0.65 = medium (boundary inclusive)', at65.matches[0].severity === 'medium');
  const at39 = normalizeComplyAdvantage({
    content: { data: { id: 1, hits: [{ id: 'z', score: 0.39, doc: { name: 'z', sources: [{ name: 'OFAC' }] } }] } },
  });
  check('CA: score 0.39 = unknown (below low threshold)', at39.matches[0].severity === 'unknown');
}

// Missing fields gracefully degrade.
{
  const r = normalizeComplyAdvantage({});
  check('CA: empty envelope = clear', r.resultCode === 'clear');
  check('CA: empty envelope = 0 matches', r.matches.length === 0);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
