#!/usr/bin/env node
/**
 * Line-coverage floor gate for contracts/src.
 *
 * Parses an lcov tracefile produced by `forge coverage --report lcov` and
 * fails when total line coverage drops below the floor. The floor is a
 * ratchet: raise it when coverage improves, never lower it to make CI pass —
 * write the missing tests instead.
 *
 *   node scripts/check-coverage.mjs <lcov-file> <floor-percent>
 *   node scripts/check-coverage.mjs contracts/lcov.info 75
 *
 * Zero dependencies, same spirit as check-addressbook.mjs / check-natspec.mjs.
 */

import { readFileSync } from 'node:fs';

const [, , lcovPath, floorArg] = process.argv;
if (!lcovPath || !floorArg) {
  console.error('usage: node scripts/check-coverage.mjs <lcov-file> <floor-percent>');
  process.exit(2);
}
const floor = Number(floorArg);
if (!Number.isFinite(floor) || floor <= 0 || floor > 100) {
  console.error(`invalid floor "${floorArg}" — expected a percentage in (0, 100]`);
  process.exit(2);
}

const text = readFileSync(lcovPath, 'utf8');

// lcov: records are separated by end_of_record; SF: source file,
// LF: lines found, LH: lines hit. Only count contracts/src sources —
// test/script/lib must never inflate the number.
let found = 0;
let hit = 0;
let file = null;
const perFile = [];
let fLF = 0;
let fLH = 0;

for (const raw of text.split('\n')) {
  const line = raw.trim();
  if (line.startsWith('SF:')) {
    file = line.slice(3).replace(/\\/g, '/');
    fLF = 0;
    fLH = 0;
  } else if (line.startsWith('LF:')) {
    fLF = Number(line.slice(3));
  } else if (line.startsWith('LH:')) {
    fLH = Number(line.slice(3));
  } else if (line === 'end_of_record' && file) {
    const inScope = file.includes('src/') && !file.includes('test/') && !file.includes('script/') && !file.includes('lib/');
    if (inScope && fLF > 0) {
      found += fLF;
      hit += fLH;
      perFile.push({ file, pct: (100 * fLH) / fLF, lf: fLF, lh: fLH });
    }
    file = null;
  }
}

if (found === 0) {
  console.error(`no contracts/src lines found in ${lcovPath} — wrong tracefile or empty coverage run`);
  process.exit(2);
}

const pct = (100 * hit) / found;
perFile.sort((a, b) => a.pct - b.pct);

console.log(`Line coverage (contracts/src): ${pct.toFixed(2)}% (${hit}/${found}) — floor ${floor}%`);
console.log('Lowest-covered sources:');
for (const f of perFile.slice(0, 8)) {
  console.log(`  ${f.pct.toFixed(2).padStart(6)}%  ${f.file} (${f.lh}/${f.lf})`);
}

if (pct < floor) {
  console.error(`\nFAIL: ${pct.toFixed(2)}% < ${floor}% floor. Add tests for the files above.`);
  process.exit(1);
}
console.log('\nPASS');
