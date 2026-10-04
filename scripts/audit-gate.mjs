#!/usr/bin/env node
// Dependency audit gate for CI.
//
//   node scripts/audit-gate.mjs                run the gate
//   node scripts/audit-gate.mjs --no-allowlist run it with no exceptions (to see everything)
//
// `npm audit --audit-level=high` fails the build on ANY high or critical advisory in the
// whole graph, including ones that have no fixed release at all. That is the right default
// and it stays the rule here: every high or critical advisory fails the gate, EXCEPT the
// few listed below, each with the reason it is safe to carry, and an expiry after which the
// gate fails again so the exception cannot be forgotten.
//
// An audit that could not run is not a pass: a registry error fails the gate too.

import { spawnSync } from 'node:child_process';

// An exception is only ever for an advisory that (a) has no patched release to move to and
// (b) cannot reach production code or untrusted input. Both facts are checked by a person
// when the entry is written and again when it expires.
const ALLOWLIST = [
  {
    id: 'GHSA-vfj7-8cjw-p6xm',
    package: 'braces',
    reason:
      'Stack exhaustion on deeply nested brace patterns. No patched release exists (the latest braces, 3.0.3, is the ' +
      'affected one). It is reached only through eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> ' +
      'micromatch, i.e. lint tooling that expands glob patterns from our own config files, never from user input; ' +
      '`npm ls braces --omit=dev` shows it is dev-only and `npm audit --omit=dev --audit-level=high` is clean.',
    expires: '2026-12-31',
  },
];

const useAllowlist = !process.argv.includes('--no-allowlist');
const today = new Date().toISOString().slice(0, 10);

const run = spawnSync('npm', ['audit', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
  maxBuffer: 64 * 1024 * 1024,
});

let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error('audit-gate: npm audit produced no readable report.');
  console.error((run.stderr || run.stdout || '').slice(0, 600));
  process.exit(1);
}
if (report.error) {
  console.error(`audit-gate: npm audit could not run: ${report.error.summary ?? report.error.code ?? 'unknown error'}`);
  process.exit(1);
}

// Every distinct advisory (an object in a vulnerability's `via`), keyed by its GHSA id.
const found = new Map();
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object' || !via.url) continue;
    const id = via.url.split('/').pop();
    if (via.severity !== 'high' && via.severity !== 'critical') continue;
    found.set(id, { id, package: via.name, severity: via.severity, title: via.title, url: via.url, range: via.range });
  }
}

const blocking = [];
const carried = [];
for (const adv of found.values()) {
  const entry = useAllowlist ? ALLOWLIST.find((a) => a.id === adv.id) : undefined;
  if (!entry) blocking.push({ adv, why: 'not allowed' });
  else if (entry.expires < today) blocking.push({ adv, why: `its exception expired on ${entry.expires}` });
  else carried.push({ adv, entry });
}
const stale = useAllowlist ? ALLOWLIST.filter((a) => !found.has(a.id)) : [];

console.log(`audit-gate: ${found.size} high or critical advisor${found.size === 1 ? 'y' : 'ies'} in the dependency graph.`);
for (const { adv, entry } of carried) {
  console.log(`\n  carried   ${adv.id}  ${adv.package}  (${adv.severity}, affects ${adv.range})`);
  console.log(`            ${adv.title}`);
  console.log(`            until ${entry.expires}: ${entry.reason}`);
}
for (const e of stale) {
  console.log(`\n  note      ${e.id} (${e.package}) is no longer reported: remove its exception from scripts/audit-gate.mjs.`);
}
if (blocking.length > 0) {
  console.error('\naudit-gate: FAILED. These advisories block the build:');
  for (const { adv, why } of blocking) {
    console.error(`  ${adv.severity.toUpperCase()}  ${adv.package}  ${adv.id}  — ${adv.title}`);
    console.error(`            ${adv.url}  (${why})`);
  }
  console.error('\nFix by upgrading to a patched release. If none exists and the package cannot reach production, add a reasoned, expiring entry to ALLOWLIST.');
  process.exit(1);
}
console.log('\naudit-gate: ok.');
