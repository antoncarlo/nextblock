/**
 * Offering-terms domain smoke checks (pure, no network).
 *
 *   node --experimental-strip-types app/scripts/offering-terms-smoke.ts
 *
 * Scope: validation (all failure classes + normalisation), APY formatting,
 * DB-row parsing (including malformed rows), vault indexing.
 */

import {
  validateOfferingTerms,
  formatApyRangeBps,
  parseTermsRow,
  indexTermsByVault,
  MAX_TARGET_BPS,
  type OfferingTermsInput,
} from '../src/lib/offering/terms.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const VAULT = '0x47b1F34b1aA2683Ebd0bC3A5D0F8507Af064BCa3';

function valid(): OfferingTermsInput {
  return {
    vaultAddress: VAULT,
    managerName: 'Klapton Re Partners Ltd',
    strategyStatement: 'Low-volatility off-chain reinsurance portfolio.',
    riskGrade: 'lower',
    targetApyMinBps: 500,
    targetApyMaxBps: 800,
  };
}

// ─── Validation: happy path + normalisation ─────────────────────────────────
const ok = validateOfferingTerms(valid());
check('valid input accepted', ok.ok);
if (ok.ok) {
  check('address lowercased', ok.value.vaultAddress === VAULT.toLowerCase());
  check('risk grade uppercased', ok.value.riskGrade === 'LOWER');
}

// ─── Validation: failure classes ─────────────────────────────────────────────
const badAddr = validateOfferingTerms({ ...valid(), vaultAddress: '0x123' });
check('short address rejected', !badAddr.ok);

const emptyName = validateOfferingTerms({ ...valid(), managerName: '   ' });
check('blank manager rejected', !emptyName.ok);

const longStrategy = validateOfferingTerms({ ...valid(), strategyStatement: 'x'.repeat(281) });
check('overlong strategy rejected', !longStrategy.ok);

const badGrade = validateOfferingTerms({ ...valid(), riskGrade: 'EXTREME' });
check('unknown risk grade rejected', !badGrade.ok);

const inverted = validateOfferingTerms({ ...valid(), targetApyMinBps: 900, targetApyMaxBps: 800 });
check('min > max rejected', !inverted.ok);

const tooHigh = validateOfferingTerms({ ...valid(), targetApyMaxBps: MAX_TARGET_BPS + 1 });
check('above-cap APY rejected', !tooHigh.ok);

const fractional = validateOfferingTerms({ ...valid(), targetApyMinBps: 5.5 });
check('non-integer bps rejected', !fractional.ok);

const negative = validateOfferingTerms({ ...valid(), targetApyMinBps: -1 });
check('negative bps rejected', !negative.ok);

const multi = validateOfferingTerms({ ...valid(), vaultAddress: 'nope', managerName: '', riskGrade: 'X' });
check('all errors collected', !multi.ok && !('value' in multi) && multi.errors.length >= 3);

// ─── APY formatting ──────────────────────────────────────────────────────────
check('integer percent formatting', formatApyRangeBps(800, 1200) === '8–12%');
check('fractional percent formatting', formatApyRangeBps(850, 1250) === '8.5–12.5%');
check('zero floor formatting', formatApyRangeBps(0, 500) === '0–5%');

// ─── Row parsing ─────────────────────────────────────────────────────────────
const row = parseTermsRow({
  vault_address: VAULT.toLowerCase(),
  manager_name: 'Alpine Re',
  strategy_statement: 'Catastrophe-focused.',
  risk_grade: 'HIGH',
  target_apy_min_bps: 1400,
  target_apy_max_bps: 1800,
  updated_by: '0xcurator',
  updated_at: '2026-07-07T00:00:00Z',
});
check('well-formed row parsed', row !== null && row.riskGrade === 'HIGH' && row.targetApyMaxBps === 1800);

const malformed = parseTermsRow({ vault_address: VAULT, manager_name: 42, risk_grade: 'HIGH' });
check('malformed row returns null', malformed === null);

const badGradeRow = parseTermsRow({
  vault_address: VAULT,
  manager_name: 'X',
  strategy_statement: 'Y',
  risk_grade: 'WILD',
  target_apy_min_bps: 1,
  target_apy_max_bps: 2,
});
check('unknown grade row returns null', badGradeRow === null);

// ─── Indexing ────────────────────────────────────────────────────────────────
if (row !== null) {
  const map = indexTermsByVault([row]);
  check('index keyed by lowercase address', map.get(VAULT.toLowerCase()) === row);
  check('lookup with checksum case misses (callers must lowercase)', map.get(VAULT) === undefined);
}

// ─── Verdict ─────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL PASS');
