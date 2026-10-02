#!/usr/bin/env node
// Regenerates the ABI block of app/src/config/contracts.ts from the Foundry
// build output, and (with --check) fails when the committed block has drifted.
//
//   npm run codegen:abis     rewrite the ABI block from contracts/out
//   npm run check:abis       exit 1 if the committed block differs from contracts/out
//
// Why this exists: the file header has always said "Generated from Foundry build
// output ... re-generate after contract changes", but nothing generated it. The
// ABIs therefore went stale silently -- the frontend had no `underwrites`, the
// getter the claim path now depends on, long after the contract grew it.
//
// Only the ABI block is owned by this script: everything from the first
// `export const ..._ABI` to the last `] as const;`. The address tables and helpers
// below it are hand-written and are left exactly as they are.
//
// Run `forge build` in contracts/ first; the ABIs are read from contracts/out.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(root, 'contracts', 'out');
const TARGET = path.join(root, 'app', 'src', 'config', 'contracts.ts');

// Exported constant -> Solidity contract. Order is the order in the file.
const ABIS = [
  ['VAULT_FACTORY_ABI', 'VaultFactory'],
  ['INSURANCE_VAULT_ABI', 'InsuranceVault'],
  ['POLICY_REGISTRY_ABI', 'PolicyRegistry'],
  ['CLAIM_RECEIPT_ABI', 'ClaimReceipt'],
  ['PROTOCOL_ROLES_ABI', 'ProtocolRoles'],
  ['COMPLIANCE_REGISTRY_ABI', 'ComplianceRegistry'],
  ['PORTFOLIO_REGISTRY_ABI', 'PortfolioRegistry'],
  ['PREMIUM_DISTRIBUTOR_ABI', 'PremiumDistributor'],
  ['NAV_ORACLE_ABI', 'NavOracle'],
  ['VAULT_ALLOCATOR_ABI', 'VaultAllocator'],
  ['CLAIM_MANAGER_ABI', 'ClaimManager'],
  ['AI_ASSESSOR_ABI', 'AIAssessor'],
  ['BORDEREAU_ORACLE_ABI', 'BordereauOracle'],
  ['ADAPTER_REGISTRY_ABI', 'AdapterRegistry'],
  ['NEXTBLOCK_LENS_ABI', 'NextBlockLens'],
];

const check = process.argv.includes('--check');

function fail(message) {
  console.error(`abis: ${message}`);
  process.exit(1);
}

function loadAbi(contract) {
  const file = path.join(OUT_DIR, `${contract}.sol`, `${contract}.json`);
  if (!fs.existsSync(file)) fail(`missing build output for ${contract} (${file}) -- run \`forge build\` in contracts/`);
  const abi = JSON.parse(fs.readFileSync(file, 'utf8')).abi;
  if (!Array.isArray(abi)) fail(`${contract}: no abi array in build output`);
  return abi;
}

const block = (name, abi) => `export const ${name} = ${JSON.stringify(abi, null, 2)} as const;`;

const source = fs.readFileSync(TARGET, 'utf8');
const crlf = source.includes('\r\n');
const text = source.replace(/\r\n/g, '\n');

const start = text.indexOf(`export const ${ABIS[0][0]} =`);
const lastMarker = `export const ${ABIS[ABIS.length - 1][0]} =`;
const lastStart = text.indexOf(lastMarker);
if (start === -1 || lastStart === -1) fail('could not find the ABI block in contracts.ts');
const endMarker = '\n] as const;';
const end = text.indexOf(endMarker, lastStart);
if (end === -1) fail('could not find the end of the last ABI');
const endOfBlock = end + endMarker.length;

const fresh = ABIS.map(([name, contract]) => block(name, loadAbi(contract))).join('\n\n');
const current = text.slice(start, endOfBlock);

if (check) {
  if (current === fresh) {
    console.log(`abis: ok -- ${ABIS.length} ABIs match contracts/out`);
    process.exit(0);
  }
  const drifted = ABIS.filter(([name, contract]) => {
    const i = current.indexOf(`export const ${name} =`);
    if (i === -1) return true;
    const j = current.indexOf('\n] as const;', i);
    return current.slice(i, j + '\n] as const;'.length) !== block(name, loadAbi(contract));
  }).map(([name]) => name);
  console.error(`abis: DRIFT -- ${drifted.length} of ${ABIS.length} differ from contracts/out:`);
  for (const name of drifted) console.error(`  ${name}`);
  console.error('Run `npm run codegen:abis` and commit the result.');
  process.exit(1);
}

const next = text.slice(0, start) + fresh + text.slice(endOfBlock);
fs.writeFileSync(TARGET, crlf ? next.replace(/\n/g, '\r\n') : next);
console.log(`abis: wrote ${ABIS.length} ABIs to app/src/config/contracts.ts (${next === text ? 'no change' : 'updated'})`);
