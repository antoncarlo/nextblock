/**
 * Smoke: bordereau CSV parser + portfolio aggregation.
 * Runs under `node --experimental-strip-types` — pure, no network.
 */
import {
  parseCsv,
  parseAmount,
  parseBordereauDate,
  summarizeBordereau,
} from '../src/lib/portfolio/bordereau.ts';

let failures = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) failures++;
}

// --- CSV parsing ---
const parsed = parseCsv('a,b,c\n1,"2,two",3\n');
check('parseCsv row count', parsed.length === 2);
check('parseCsv quoted embedded comma', parsed[1][1] === '2,two');

// --- Amount parsing ---
check('amount $ and thousands', parseAmount('$10,000,000') === 10_000_000);
check('amount US decimals', parseAmount('1,234,567.89') === 1_234_567.89);
check('amount EU decimals', parseAmount('1.234.567,89') === 1_234_567.89);
check('amount parentheses negative', parseAmount('(1000)') === -1000);
check('amount empty is null', parseAmount('  ') === null);

// --- Date parsing ---
check('date ISO', parseBordereauDate('2026-01-01')?.iso === '2026-01-01');
check('date dd/mm unambiguous (day>12)', parseBordereauDate('15/03/2026')?.iso === '2026-03-15');
check('date mm/dd unambiguous (2nd>12)', parseBordereauDate('03/15/2026')?.iso === '2026-03-15');
const amb = parseBordereauDate('05/06/2026');
check('date ambiguous flagged + EU default', amb?.iso === '2026-06-05' && amb?.ambiguous === true);
const serial = parseBordereauDate('46000');
check('date excel serial parses', serial !== null && /^\d{4}-\d{2}-\d{2}$/.test(serial!.iso));
check('date garbage is null', parseBordereauDate('not-a-date') === null);

// --- Full bordereau aggregation ---
const csv = [
  'Policy Ref,Insured,Sum Insured,Ceded Premium,Inception,Expiry,Line of Business,Country',
  'POL-001,Acme Sarl,"$10,000,000","50,000.00",2026-01-01,2026-12-31,Property CAT,EU',
  'POL-002,Beta GmbH,"5,000,000","25,000",2026-02-01,2026-11-30,Property CAT,EU',
  'POL-003,Gamma Ltd,2500000,12500.50,2026-03-15,2027-03-14,Marine,UK',
].join('\n');

const res = summarizeBordereau(csv);
check('summary ok', res.ok === true);
if (res.ok) {
  const s = res.summary;
  check('policyCount = 3', s.policyCount === 3);
  check('coverage aggregate = 17,500,000', s.coverageLimit === '17500000.00');
  check('premium aggregate = 87,500.50', s.cededPremium === '87500.50');
  check('earliest inception', s.inceptionDate === '2026-01-01');
  check('latest expiry', s.expiryDate === '2027-03-14');
  check('mode line of business = Property CAT', s.lineOfBusiness === 'Property CAT');
  check('mode jurisdiction = EU', s.jurisdiction === 'EU');
}

// --- Missing required column is a hard error ---
const noPrem = summarizeBordereau('Sum Insured,Inception\n1000000,2026-01-01\n');
check('missing premium column errors out', noPrem.ok === false);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
