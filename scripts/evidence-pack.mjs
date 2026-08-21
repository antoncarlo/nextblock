#!/usr/bin/env node
/**
 * Assembles the audit evidence pack from a campaign log.
 *
 * Every figure in the output is read from an artefact rather than typed in.
 * A pack whose numbers were transcribed by hand is a pack that will disagree
 * with the run it describes the first time somebody edits one and not the
 * other, and the disagreement will surface in front of an auditor.
 *
 * Usage:
 *   node scripts/evidence-pack.mjs <campaign.log> [output.md]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const [, , logPath, outPath = 'docs/audit/EVIDENCE_PACK.md'] = process.argv;

if (!logPath) {
  console.error('usage: node scripts/evidence-pack.mjs <campaign.log> [output.md]');
  process.exit(2);
}

const log = readFileSync(logPath, 'utf8');

/** One row per invariant, with the numbers Foundry reported for it. */
function parseInvariants(text) {
  const rows = [];
  const re = /^\[(PASS|FAIL)[^\]]*\]\s+(invariant_\w+)\(\)\s+\(runs:\s*(\d+),\s*calls:\s*(\d+),\s*reverts:\s*(\d+)\)/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    rows.push({ status: m[1], name: m[2], runs: Number(m[3]), calls: Number(m[4]), reverts: Number(m[5]) });
  }
  return rows;
}

function parseSuite(text) {
  const m = /Suite result:\s*(\w+)\.\s*(\d+)\s+passed;\s*(\d+)\s+failed;\s*(\d+)\s+skipped;\s*finished in ([\d.]+)s/.exec(text);
  return m ? { result: m[1], passed: +m[2], failed: +m[3], skipped: +m[4], seconds: +m[5] } : null;
}

const invariants = parseInvariants(log);
const suite = parseSuite(log);

if (invariants.length === 0) {
  console.error(`No invariant results found in ${logPath}. Refusing to write a pack with nothing in it.`);
  process.exit(1);
}

const totalCalls = invariants.reduce((a, r) => a + r.calls, 0);
const totalReverts = invariants.reduce((a, r) => a + r.reverts, 0);
const failed = invariants.filter((r) => r.status === 'FAIL');
const runs = invariants[0].runs;

// A revert rate at or near zero means the agents are being refused nothing,
// which in a harness whose whole purpose is to attempt forbidden things means
// the negative perimeter is not being exercised at all.
const revertRate = ((totalReverts / totalCalls) * 100).toFixed(2);

const lines = [
  '# Agent simulation — evidence pack',
  '',
  // The basename only: a full path embeds one machine's directory layout into
  // a committed document, and says nothing an auditor can use.
  `Generated from \`${basename(logPath)}\` on ${new Date().toISOString().slice(0, 10)}.`,
  'Every figure below is read from the campaign log rather than transcribed.',
  '',
  '## Result',
  '',
  suite
    ? `**${suite.result === 'ok' ? 'No counterexample found' : 'A counterexample was found'}** — ` +
      `${suite.passed} passed, ${suite.failed} failed, in ${Math.round(suite.seconds / 60)} minutes.`
    : '_The suite summary line was absent from the log._',
  '',
  `- Invariants asserted: **${invariants.length}**`,
  `- Runs per invariant: **${runs.toLocaleString('en-US')}**`,
  `- Total calls: **${totalCalls.toLocaleString('en-US')}**`,
  `- Reverts: **${totalReverts.toLocaleString('en-US')}** (${revertRate}% of calls)`,
  '',
  '### On the revert rate',
  '',
  'It is reported because it is the fastest way to tell a campaign that proved',
  'something from one that did not. Roughly a third of the actions these agents',
  'plan are attempts at things the protocol must refuse. A rate near zero would',
  'mean those attempts never reached the checks they were written for — which is',
  'how an earlier version of this suite reported green while the claim invariants',
  'were asserting over an empty set.',
  '',
  '## Invariants',
  '',
  '| Invariant | Result | Calls | Reverts |',
  '|---|---|---:|---:|',
  ...invariants.map((r) => `| \`${r.name}\` | ${r.status} | ${r.calls.toLocaleString('en-US')} | ${r.reverts.toLocaleString('en-US')} |`),
  '',
];

if (failed.length > 0) {
  lines.push(
    '## Counterexamples',
    '',
    'The shrunk call sequence for each is in the campaign log.',
    '',
    ...failed.map((r) => `- \`${r.name}\``),
    '',
  );
}

lines.push(
  '## What this does not establish',
  '',
  'A campaign that finds no counterexample has failed to find one. It has not',
  'shown that none exists: the search is random over an enormous state space, and',
  `${totalCalls.toLocaleString('en-US')} calls is a large sample of an infinite one.`,
  '',
  'Three limits are worth stating to anyone reading this as assurance:',
  '',
  '1. The invariants assert what somebody thought to assert. A property nobody',
  '   wrote down cannot fail here.',
  '2. The harness runs against a local deployment. Behaviour that depends on real',
  '   RPC latency, reorgs or mempool ordering is outside it.',
  '3. An internal exercise is not an external audit and does not substitute for one.',
  '',
);

writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${outPath}: ${invariants.length} invariants, ${totalCalls.toLocaleString('en-US')} calls, ${failed.length} failing.`);
