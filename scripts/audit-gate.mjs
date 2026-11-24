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

// An entry may carry `nodes`, the installed copies (paths in package-lock.json) it covers. The
// advisory is then carried only while every copy npm reports is one of them: a new or moved copy,
// say our own code resolving the vulnerable version again, fails the gate. Without `nodes` the
// entry covers the advisory wherever it is.
//
// An exception is only ever for an advisory that (a) has no patched release this project can
// move to and (b) cannot reach production code or untrusted input. Both facts are checked by a
// person when the entry is written and again when it expires. A patched release that exists but
// would break its only consumer counts as one this project cannot move to, and the entry says why.
const ALLOWLIST = [
  {
    id: 'GHSA-qr28-fpjm-wq7f',
    package: 'decode-uri-component',
    reason:
      'Quadratic-time replacement of long runs of percent-encoded characters (denial of service). The patched ' +
      '0.5.1 is ESM-only, while its only consumer, query-string 7.1.3, loads it with require, so forcing it would ' +
      'break the parsing of WalletConnect pairing URIs in the browser. It is reached only through ' +
      '@walletconnect/utils -> query-string, in wallet-connection code that runs in the visitor\'s own browser on ' +
      'URIs their own wallet hands over: the worst case is a stalled tab for that visitor. No server-side code ' +
      'imports it (checked: nothing under app/src/app/api, app/src/lib/server or app/src/lib/providers imports the ' +
      'wallet stack). @walletconnect/utils 2.26 no longer depends on query-string; moving the wallet stack to it ' +
      'is a change to test with a real wallet, not to slip into an advisory fix.',
    expires: '2027-01-31',
  },
  {
    id: 'GHSA-mrhx-c7xc-m3w5',
    package: 'zod',
    nodes: ['node_modules/zod', 'node_modules/@reown/appkit-wallet/node_modules/zod'],
    reason:
      'Memory exhaustion when validating oversized constrained collections. Every zod 3.x is affected and 3.25.76 ' +
      'is the last of that line; the patched line is 4.6.6 and later. Our own validation of request bodies ' +
      '(app/src/app/api and app/src/lib) runs on zod 4.6.7. The copies still on 3.x belong to third-party packages ' +
      'that pin the 3 line: @coinbase/cdp-sdk and @reown/appkit-wallet, wallet SDKs that run in the visitor\'s ' +
      'browser and validate their own provider messages, and eslint-plugin-react-hooks, lint tooling. None is ' +
      'reached by input to our API. `nodes` pins the exception to those two installed copies, so if the app ' +
      'resolves zod 3 again the gate fails.',
    expires: '2027-01-31',
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
    const known = found.get(id);
    const nodes = new Set([...(known?.nodes ?? []), ...(vuln.nodes ?? [])]);
    found.set(id, { id, package: via.name, severity: via.severity, title: via.title, url: via.url, range: via.range, nodes: [...nodes] });
  }
}

const blocking = [];
const carried = [];
for (const adv of found.values()) {
  const entry = useAllowlist ? ALLOWLIST.find((a) => a.id === adv.id) : undefined;
  if (!entry) blocking.push({ adv, why: 'not allowed' });
  else if (entry.expires < today) blocking.push({ adv, why: `its exception expired on ${entry.expires}` });
  else if (entry.nodes && adv.nodes.some((n) => !entry.nodes.includes(n))) {
    const extra = adv.nodes.filter((n) => !entry.nodes.includes(n));
    blocking.push({ adv, why: `it is also present in ${extra.join(', ')}, which its exception does not cover` });
  } else carried.push({ adv, entry });
}
const stale = useAllowlist ? ALLOWLIST.filter((a) => !found.has(a.id)) : [];

console.log(`audit-gate: ${found.size} high or critical advisor${found.size === 1 ? 'y' : 'ies'} in the dependency graph.`);
for (const { adv, entry } of carried) {
  console.log(`\n  carried   ${adv.id}  ${adv.package}  (${adv.severity}, affects ${adv.range})`);
  console.log(`            ${adv.title}`);
  console.log(`            until ${entry.expires}: ${entry.reason}`);
  if (entry.nodes) console.log(`            covers only: ${entry.nodes.join(', ')}`);
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
