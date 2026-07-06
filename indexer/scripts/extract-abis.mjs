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
 * subgraph.yaml/mappings accordingly (CI's addressbook job does not cover
 * this — the subgraph build itself is the drift check).
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

mkdirSync(ABIS, { recursive: true });

function graphSignature(ev) {
  const params = ev.inputs
    .map((i) => `${i.indexed ? 'indexed ' : ''}${i.type}`)
    .join(',');
  return `${ev.name}(${params})`;
}

for (const name of CONTRACTS) {
  const artifact = JSON.parse(
    readFileSync(join(OUT, `${name}.sol`, `${name}.json`), 'utf8'),
  );
  writeFileSync(
    join(ABIS, `${name}.json`),
    JSON.stringify(artifact.abi, null, 2) + '\n',
  );
  const events = artifact.abi.filter((e) => e.type === 'event');
  console.log(`\n# ${name} (${events.length} events)`);
  for (const ev of events) console.log(`  - event: ${graphSignature(ev)}`);
}
