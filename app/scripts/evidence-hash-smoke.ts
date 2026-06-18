/**
 * Evidence keccak256 hashing smoke checks (Claims sub-project 2).
 *
 *   node --experimental-strip-types app/scripts/evidence-hash-smoke.ts
 *
 * Scope: keccak256 of file bytes + 0x/case-insensitive hash matching against the
 * on-chain evidenceHash. No network.
 */

import { keccak256Hex, hashesMatch } from '../src/lib/evidence/hash.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const enc = new TextEncoder();

// Known vector: keccak256 of empty input.
const EMPTY_KECCAK = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';
check('empty keccak vector', keccak256Hex(new Uint8Array(0)) === EMPTY_KECCAK);

const h = keccak256Hex(enc.encode('evidence document v1'));
check('format 0x + 64 hex', /^0x[0-9a-f]{64}$/.test(h));
check('deterministic', keccak256Hex(enc.encode('evidence document v1')) === h);
check('collision-resistant', keccak256Hex(enc.encode('evidence document v2')) !== h);

// hashesMatch: 0x + case-insensitive.
check('match identical', hashesMatch(h, h));
check('match case-insensitive', hashesMatch(h, h.toUpperCase().replace('0X', '0x')));
check('no match different', !hashesMatch(h, EMPTY_KECCAK));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
