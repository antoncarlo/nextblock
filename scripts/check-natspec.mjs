#!/usr/bin/env node
/**
 * NatSpec coverage checker for contracts/src.
 *
 * Audit-grade documentation gate: every contract/interface/library declaration
 * and every EXTERNAL/PUBLIC function, event, error and public state variable
 * must carry a NatSpec comment (`///` or `/** … *\/`) immediately above it
 * (blank lines and attribute lines are tolerated).
 *
 * Zero dependencies, same spirit as check-addressbook.mjs. Exits non-zero on
 * any gap so CI can enforce 100% coverage:
 *
 *   node scripts/check-natspec.mjs            # report + exit code
 *   node scripts/check-natspec.mjs --list     # also list every checked item
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'contracts', 'src');
const LIST = process.argv.includes('--list');

function solFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...solFiles(p));
    else if (name.endsWith('.sol')) out.push(p);
  }
  return out;
}

/** Strip string literals so braces/keywords inside strings don't confuse us. */
function stripStrings(line) {
  return line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

/** True when the lines above `idx` end with a NatSpec block. */
function hasNatspecAbove(lines, idx) {
  let i = idx - 1;
  while (i >= 0) {
    const t = lines[i].trim();
    if (t === '') { i--; continue; }
    if (t.startsWith('///')) return true;
    if (t.endsWith('*/')) {
      // Walk back to the opener; accept /** (NatSpec), reject plain /*.
      let j = i;
      while (j >= 0 && !lines[j].trim().startsWith('/*')) j--;
      return j >= 0 && lines[j].trim().startsWith('/**');
    }
    // Anything else (code, attribute) breaks the comment adjacency.
    return false;
  }
  return false;
}

/** Collect a declaration header from `idx` until `{` or `;` (multi-line safe). */
function readHeader(lines, idx) {
  let header = '';
  for (let i = idx; i < Math.min(lines.length, idx + 12); i++) {
    header += ' ' + stripStrings(lines[i]);
    if (/[{;]/.test(stripStrings(lines[i]))) break;
  }
  return header;
}

const failures = [];
let checked = 0;

for (const file of solFiles(ROOT)) {
  const rel = relative(process.cwd(), file).replaceAll('\\', '/');
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  let inInterface = false;
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = stripStrings(lines[i]);
    const t = raw.trim();

    // Track whether we're inside an interface (members default to external).
    const typeDecl = /^(abstract\s+)?(contract|interface|library)\s+(\w+)/.exec(t);
    if (typeDecl && depth === 0) {
      inInterface = typeDecl[2] === 'interface';
      checked++;
      if (!hasNatspecAbove(lines, i)) failures.push(`${rel}:${i + 1} ${typeDecl[2]} ${typeDecl[3]}`);
    }

    // Declarations we require docs on (top-level members: depth === 1).
    if (depth === 1 || (typeDecl && depth === 0)) {
      const fn = /^function\s+(\w+)/.exec(t);
      if (fn) {
        const header = readHeader(lines, i);
        const isPublicSurface = inInterface || /\b(external|public)\b/.test(header);
        if (isPublicSurface) {
          checked++;
          if (!hasNatspecAbove(lines, i)) failures.push(`${rel}:${i + 1} function ${fn[1]}`);
          else if (LIST) console.log(`ok  ${rel}:${i + 1} function ${fn[1]}`);
        }
      }
      const ev = /^(event|error)\s+(\w+)/.exec(t);
      if (ev) {
        checked++;
        if (!hasNatspecAbove(lines, i)) failures.push(`${rel}:${i + 1} ${ev[1]} ${ev[2]}`);
      }
      const ctor = /^constructor\s*\(/.exec(t);
      if (ctor) {
        checked++;
        if (!hasNatspecAbove(lines, i)) failures.push(`${rel}:${i + 1} constructor`);
      }
      // Public/external state variables (incl. constants/immutables).
      const sv = /^[\w\[\]().=>\s]+\b(public|external)\b[\w\s]*\b(\w+)\s*(=|;)/.exec(t);
      if (sv && !t.startsWith('function') && !t.startsWith('return')) {
        checked++;
        if (!hasNatspecAbove(lines, i)) failures.push(`${rel}:${i + 1} public var ${sv[2]}`);
      }
    }

    for (const ch of raw) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
  }
}

console.log(`\nNatSpec coverage: ${checked - failures.length}/${checked} documented`);
if (failures.length > 0) {
  console.log(`\nMissing NatSpec (${failures.length}):`);
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log('100% — every public surface is documented.');
