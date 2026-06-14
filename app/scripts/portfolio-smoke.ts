/**
 * Portfolio onboarding form smoke checks.
 *
 * Runs with the Node 22 TypeScript strip-types loader so no test framework or
 * new dependency is required:
 *
 *   node --experimental-strip-types app/scripts/portfolio-smoke.ts
 *
 * Scope: pure validation, enum/structure mapping, USDC 6-decimal parsing and
 * documentHash derivation. No network, no wagmi, no key material.
 */

import {
  validatePortfolioForm,
  deriveDocumentHash,
  toUnixSeconds,
  parseUsdc,
  isValidLossBps,
  StructureType,
  STRUCTURE_LABEL,
  type PortfolioFormInput,
} from '../src/lib/portfolio/form.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const valid: PortfolioFormInput = {
  name: 'EU Property CAT QS 2026',
  lineOfBusiness: 'Property CAT',
  jurisdiction: 'EU',
  structureType: StructureType.QUOTA_SHARE,
  coverageLimit: '1000000',
  cededPremium: '100000',
  inceptionDate: '2026-01-01',
  expiryDate: '2026-12-31',
  metadataURI: 'ipfs://QmDocs',
  evidenceReference: 'bordereau-2026-01',
};

// --- Happy path ---
const ok = validatePortfolioForm(valid);
check('valid form passes', ok.ok === true);
if (ok.ok) {
  check('coverage parsed to 6dp', ok.params.coverageLimit === 1_000_000_000_000n);
  check('premium parsed to 6dp', ok.params.cededPremium === 100_000_000_000n);
  check('documentHash is non-zero bytes32', /^0x[0-9a-f]{64}$/.test(ok.params.documentHash) && ok.params.documentHash !== `0x${'0'.repeat(64)}`);
  check('inception < expiry', ok.params.inceptionTime < ok.params.expiryTime);
  check('structureType preserved', ok.params.structureType === StructureType.QUOTA_SHARE);
}

// --- Decimal parsing ---
check('parseUsdc 6dp exact', parseUsdc('1.5') === 1_500_000n);
check('parseUsdc integer', parseUsdc('250') === 250_000_000n);

// --- USDC validation ---
check('rejects zero coverage', validatePortfolioForm({ ...valid, coverageLimit: '0' }).ok === false);
check('rejects negative-ish premium', validatePortfolioForm({ ...valid, cededPremium: 'abc' }).ok === false);
check('rejects >6 decimals', validatePortfolioForm({ ...valid, coverageLimit: '1.1234567' }).ok === false);

// --- Required fields ---
check('rejects empty name', validatePortfolioForm({ ...valid, name: '   ' }).ok === false);
check('rejects empty line of business', validatePortfolioForm({ ...valid, lineOfBusiness: '' }).ok === false);
check('rejects empty jurisdiction', validatePortfolioForm({ ...valid, jurisdiction: '' }).ok === false);
check('rejects empty evidence (documentHash must be non-zero)', validatePortfolioForm({ ...valid, evidenceReference: '' }).ok === false);

// --- Date validation ---
check('rejects expiry <= inception', validatePortfolioForm({ ...valid, expiryDate: '2026-01-01' }).ok === false);
check('rejects missing inception', validatePortfolioForm({ ...valid, inceptionDate: '' }).ok === false);
check('toUnixSeconds bad date -> 0', toUnixSeconds('not-a-date') === 0n);
check('toUnixSeconds valid', toUnixSeconds('2026-01-01') === 1767225600n);

// --- Hash + enum/label mapping ---
check('deriveDocumentHash deterministic', deriveDocumentHash('x') === deriveDocumentHash('x'));
check('deriveDocumentHash distinct', deriveDocumentHash('a') !== deriveDocumentHash('b'));
check('structure labels complete', Object.keys(STRUCTURE_LABEL).length === 5);

// --- expectedLossBps validation (curator approve) ---
check('lossBps 0 valid', isValidLossBps(0));
check('lossBps 10000 valid', isValidLossBps(10_000));
check('lossBps 10001 invalid', !isValidLossBps(10_001));
check('lossBps negative invalid', !isValidLossBps(-1));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll portfolio smoke checks passed');
