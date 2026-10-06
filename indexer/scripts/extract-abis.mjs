#!/usr/bin/env node
/**
 * Extracts contract ABIs from the Foundry artifacts in ../contracts/out into
 * ./abis/<Name>.json, and prints every event in The Graph manifest signature
 * format (types only, `indexed` prefixed) so subgraph.yaml handlers can be
 * written without guessing signatures.
 *
 *   cd indexer && node scripts/extract-abis.mjs
 *
 * Re-run after any contract change that touches events, then update
 * subgraph.yaml/mappings accordingly.
 *
 *   node scripts/extract-abis.mjs --check   fail if a committed ABI differs from the build
 *
 * The check is what keeps the ABIs honest: for months they were those of July while the
 * contracts went on emitting new events, and an event missing from the ABI is an event the
 * subgraph never sees. CI runs it after the contracts are built.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'contracts', 'out');
const ABIS = join(HERE, '..', 'abis');

const CONTRACTS = [
  'InsuranceVault',
  'VaultFactory',
  'PolicyRegistry',
  'PortfolioRegistry',
  'ClaimManager',
  'ClaimReceipt',
  'ComplianceRegistry',
  'PremiumDistributor',
  'NavOracle',
  'BordereauOracle',
  'VaultAllocator',
  'AIAssessor',
  'AdapterRegistry',
  'LendingMarket',
  'RedemptionQueue',
];

// A data source names one ABI, so the contracts that share a data source are written as one
// file: the first contract's entries, then whatever the others add. Where two define the same
// event (same name and parameter types) the first one's entry stays, because the mapping is
// written against its parameter names; handlers read parameters by position, so the later
// contract's event of that signature is decoded by it all the same.
//   BordereauOracle   the stand-in deployed today, then UmaBordereauOracle, which keeps its events
//                     and adds AssertionBonded, AssertionSettled, DisputeReasonGiven and
//                     BondAmountUpdated. After the next deployment the data source points at
//                     the UMA-backed one; the handlers need no change.
const SHARED = { BordereauOracle: ['UmaBordereauOracle'] };

const CHECK = process.argv.includes('--check');
const drift = [];

if (!CHECK) mkdirSync(ABIS, { recursive: true });

function entryKey(e) {
  const types = (e.inputs ?? []).map((i) => i.type).join(',');
  return `${e.type}:${e.name ?? ''}(${types})`;
}

function readAbi(name) {
  return JSON.parse(readFileSync(join(OUT, `${name}.sol`, `${name}.json`), 'utf8')).abi;
}

function graphSignature(ev) {
  const params = ev.inputs
    .map((i) => `${i.indexed ? 'indexed ' : ''}${i.type}`)
    .join(',');
  return `${ev.name}(${params})`;
}

for (const name of CONTRACTS) {
  const abi = readAbi(name);
  for (const other of SHARED[name] ?? []) {
    const seen = new Set(abi.map(entryKey));
    for (const e of readAbi(other)) {
      if (e.type === 'constructor' || seen.has(entryKey(e))) continue;
      seen.add(entryKey(e));
      abi.push(e);
    }
  }
  const next = JSON.stringify(abi, null, 2) + '\n';
  const file = join(ABIS, `${name}.json`);
  if (CHECK) {
    let current = '';
    try {
      current = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    } catch {
      // a missing file is drift too
    }
    if (current !== next) drift.push(name);
    continue;
  }
  writeFileSync(file, next);
  const events = abi.filter((e) => e.type === 'event');
  console.log(`\n# ${name} (${events.length} events)`);
  for (const ev of events) console.log(`  - event: ${graphSignature(ev)}`);
}

if (CHECK) {
  if (drift.length > 0) {
    console.error(`indexer abis: out of date with the contracts build: ${drift.join(', ')}`);
    console.error('Run `node scripts/extract-abis.mjs` in indexer/, then add handlers for any new event.');
    process.exit(1);
  }
  console.log(`indexer abis: ok -- ${CONTRACTS.length} ABIs match contracts/out`);
}
