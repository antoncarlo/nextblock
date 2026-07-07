/**
 * Oracle-node smoke checks (pure, no network).
 *
 *   node --experimental-strip-types app/scripts/oracle-node-smoke.ts
 *
 * Scope: canonical-JSON determinism + sourceHash parity with a
 * `cast keccak` vector, HMAC verify pass/fail classes, NAV report
 * validation (all failure classes, staleness window, bps conversion).
 */

import {
  canonicalJson,
  sourceHash,
  computeBrainoSignature,
  verifyBrainoSignature,
  validateNavReport,
  MAX_REPORT_AGE_SECONDS,
  type NavReport,
} from '../src/lib/oracle-node.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

// ─── Canonical JSON ──────────────────────────────────────────────────────────
check(
  'keys sorted at every depth',
  canonicalJson({ b: { d: 1, c: 2 }, a: 3 }) === '{"a":3,"b":{"c":2,"d":1}}',
);
check('arrays keep order', canonicalJson({ x: [3, 1, 2] }) === '{"x":[3,1,2]}');
check('no whitespace', !canonicalJson({ a: [1, { b: 'x y' }] }).includes(', '));
check('unicode preserved via JSON escaping', canonicalJson({ s: 'nàv€' }) === '{"s":"nàv€"}');
check('null supported', canonicalJson({ a: null }) === '{"a":null}');

let threw = false;
try {
  canonicalJson({ a: Number.NaN });
} catch {
  threw = true;
}
check('NaN rejected, not coerced', threw);

// ─── sourceHash parity with cast ─────────────────────────────────────────────
// cast keccak '{"confidence":0.95,"nav":"151000000","reportId":"rep-001","vault":"0x47b1f34b1aa2683ebd0bc3a5d0f8507af064bca3"}'
const CAST_VECTOR = '0x218f12ec0b33f901feb51daaabbfe20afcf65e96cd81729a6a6cde673a90ac06';
check(
  'sourceHash parity with cast keccak',
  sourceHash({
    vault: '0x47b1f34b1aa2683ebd0bc3a5d0f8507af064bca3',
    nav: '151000000',
    confidence: 0.95,
    reportId: 'rep-001',
  }) === CAST_VECTOR,
);
check(
  'key insertion order irrelevant',
  sourceHash({ reportId: 'rep-001', confidence: 0.95, vault: '0x47b1f34b1aa2683ebd0bc3a5d0f8507af064bca3', nav: '151000000' }) === CAST_VECTOR,
);

// ─── HMAC ────────────────────────────────────────────────────────────────────
const SECRET = 'shared-secret-out-of-band';
const BODY = '{"report":{"nav":"1"}}';
const sig = computeBrainoSignature(BODY, SECRET);
check('hmac roundtrip verifies', verifyBrainoSignature(BODY, sig, SECRET));
check('tampered body rejected', !verifyBrainoSignature(BODY + ' ', sig, SECRET));
check('wrong secret rejected', !verifyBrainoSignature(BODY, sig, 'other-secret'));
check('missing signature rejected', !verifyBrainoSignature(BODY, undefined, SECRET));
check('malformed signature rejected', !verifyBrainoSignature(BODY, '0xzz', SECRET));

// ─── NAV report validation ───────────────────────────────────────────────────
const NOW = 1_781_900_000;
function report(overrides: Partial<NavReport> = {}): NavReport {
  return {
    vault: '0x47b1F34b1aA2683Ebd0bC3A5D0F8507Af064BCa3',
    nav: '151000000',
    confidence: 0.95,
    reportId: 'rep-001',
    modelVersion: 'nav-v2.1.0',
    generatedAt: NOW - 60,
    ...overrides,
  };
}

const ok = validateNavReport(report(), NOW);
check('valid report accepted', ok.ok);
if (ok.ok) {
  check('vault lowercased', ok.args.vault === '0x47b1f34b1aa2683ebd0bc3a5d0f8507af064bca3');
  check('nav bigint', ok.args.nav === 151_000_000n);
  check('confidence to bps', ok.args.confidenceBps === 9_500);
  check('sourceHash present', ok.args.sourceHash.startsWith('0x') && ok.args.sourceHash.length === 66);
}

check('bad vault rejected', !validateNavReport(report({ vault: '0x123' }), NOW).ok);
check('non-decimal nav rejected', !validateNavReport(report({ nav: '1.5e6' }), NOW).ok);
check('zero nav rejected', !validateNavReport(report({ nav: '0' }), NOW).ok);
check('confidence >1 rejected', !validateNavReport(report({ confidence: 1.2 }), NOW).ok);
check('stale report rejected', !validateNavReport(report({ generatedAt: NOW - MAX_REPORT_AGE_SECONDS - 1 }), NOW).ok);
check('future report rejected', !validateNavReport(report({ generatedAt: NOW + 120 }), NOW).ok);
check('boundary age accepted', validateNavReport(report({ generatedAt: NOW - MAX_REPORT_AGE_SECONDS }), NOW).ok);

const multi = validateNavReport(report({ vault: 'x', nav: '-1', confidence: 2 }), NOW);
check('all errors collected', !multi.ok && !('args' in multi) && multi.errors.length >= 3);

// ─── Verdict ─────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL PASS');
