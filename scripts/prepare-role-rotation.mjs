#!/usr/bin/env node
// Prepare the Safe transactions that hand the operational roles from the simulation
// identities to the real operators, and check the result afterwards.
//
//   node scripts/prepare-role-rotation.mjs --plan contracts/roles.rotation.json [--out dir]
//   node scripts/prepare-role-rotation.mjs --plan contracts/roles.rotation.json --check
//
// The plan names the new holder of each role. Nothing is sent and no key is read: the
// script reads the chain, simulates every call as the governance Safe, and writes two
// Transaction Builder batches the Safe owners import and sign themselves:
//
//   roles-1-grant.json   grantRole(role, new)   — run this first, then confirm each new
//                                                 holder can act
//   roles-2-revoke.json  revokeRole(role, old)  — run this only once they can
//
// Grant first, revoke second, never the reverse: revoking first leaves a role with no
// holder if anything is wrong with the new address. --check reads the chain again and
// reports whether each new holder has its role and each old one has lost it.
//
// Role separation is part of the protocol's design, so one address may not take two
// roles unless --allow-shared is given (a hardware wallet used for two small roles on a
// testnet, say). A zero address, an unfilled entry, the Safe, the timelock or the
// deployer is refused outright.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, encodeFunctionData, getAddress, http, isAddress, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const fail = (message) => {
  console.error(`role-rotation: ${message}`);
  process.exit(1);
};

// plan key -> the constant on ProtocolRoles and the address-book key of today's holder
const ROLES = {
  UNDERWRITING_CURATOR_ROLE: { holder: 'curator', what: 'underwriting syndicate operating key' },
  SENTINEL_ROLE: { holder: 'sentinel', what: 'risk guardian; reduces risk only, must be reachable at any hour' },
  CLAIMS_COMMITTEE_ROLE: { holder: 'committee', what: 'claims committee (ideally its own multisig)' },
  KYC_OPERATOR_ROLE: { holder: 'kycOperator', what: 'compliance operator' },
  ALLOCATOR_ROLE: { holder: 'allocatorBot', what: 'the allocator bot, dedicated key' },
  ORACLE_ROLE: { holder: 'oracleNode', what: 'the AI node, dedicated key (see docs/AI_INTEGRATION.md)' },
  AUTHORIZED_CEDANT_ROLE: { holder: 'cedant', what: "the ceding insurer's own wallet" },
};

const planPath = value('plan');
if (!planPath) fail('--plan <file> is required (start from contracts/roles.rotation.template.json)');
const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), 'utf8'));

const record = JSON.parse(fs.readFileSync(path.join(root, 'contracts', 'deployments', '84532-staging.json'), 'utf8'));
const rolesAddr = record.protocolRoles;
const safe = record.safe;
const timelock = record.protocolTimelock;
const deployer = record.deployer;
if (!rolesAddr || !safe) fail('the deployment record has no protocolRoles or safe');

const ABI = parseAbi([
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function getRoleAdmin(bytes32 role) view returns (bytes32)',
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
  ...Object.keys(ROLES).map((r) => `function ${r}() view returns (bytes32)`),
]);
const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'),
});

const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const refused = [safe, timelock, deployer].filter(Boolean);

// ── read the plan ────────────────────────────────────────────────────────────
const entries = [];
for (const [name, meta] of Object.entries(ROLES)) {
  const proposed = plan[name];
  const old = record[meta.holder];
  if (proposed === undefined || proposed === null || proposed === '') {
    if (flag('check')) continue;
    fail(`${name}: no new holder in the plan (${meta.what}). Fill every role or remove it from the plan deliberately.`);
  }
  if (!isAddress(proposed)) fail(`${name}: "${proposed}" is not an address`);
  const next = getAddress(proposed);
  if (/^0x0{40}$/i.test(next)) fail(`${name}: the zero address cannot hold a role`);
  if (refused.some((a) => same(a, next))) fail(`${name}: ${next} is the Safe, the timelock or the deployer, none of which may take an operational role`);
  if (old && same(old, next)) fail(`${name}: ${next} already holds the role in the deployment record; there is nothing to rotate`);
  entries.push({ name, meta, old: old ? getAddress(old) : null, next });
}
if (entries.length === 0) fail('the plan is empty');

if (!flag('allow-shared') && !flag('check')) {
  const seen = new Map();
  for (const e of entries) {
    const key = e.next.toLowerCase();
    if (seen.has(key)) fail(`${e.name} and ${seen.get(key)} would be held by the same address ${e.next}. Role separation is a design property; pass --allow-shared only if you mean it.`);
    seen.set(key, e.name);
  }
}

const roleHash = {};
for (const e of entries) roleHash[e.name] = await client.readContract({ address: rolesAddr, abi: ABI, functionName: e.name });

// ── --check: has it happened? ────────────────────────────────────────────────
if (flag('check')) {
  let ok = true;
  for (const e of entries) {
    const newHolds = await client.readContract({ address: rolesAddr, abi: ABI, functionName: 'hasRole', args: [roleHash[e.name], e.next] });
    const oldHolds = e.old ? await client.readContract({ address: rolesAddr, abi: ABI, functionName: 'hasRole', args: [roleHash[e.name], e.old] }) : false;
    const good = newHolds && !oldHolds;
    ok &&= good;
    console.log(`${good ? 'done   ' : newHolds ? 'granted' : 'pending'}  ${e.name.padEnd(26)} new ${e.next} ${newHolds ? 'holds' : 'does NOT hold'} it; old ${e.old ?? '-'} ${oldHolds ? 'STILL holds it' : 'does not'}`);
  }
  console.log(ok ? '\nrole-rotation: every role has moved.' : '\nrole-rotation: not finished (granted = new holder set, old not yet revoked; pending = nothing yet).');
  process.exit(ok ? 0 : 1);
}

// ── simulate as the Safe, then write the batches ─────────────────────────────
const transactions = { grant: [], revoke: [] };
for (const e of entries) {
  const admin = await client.readContract({ address: rolesAddr, abi: ABI, functionName: 'getRoleAdmin', args: [roleHash[e.name]] });
  const safeIsAdmin = await client.readContract({ address: rolesAddr, abi: ABI, functionName: 'hasRole', args: [admin, safe] });
  if (!safeIsAdmin) fail(`${e.name}: the Safe does not hold this role's admin role, so it cannot grant or revoke it`);

  const grant = encodeFunctionData({ abi: ABI, functionName: 'grantRole', args: [roleHash[e.name], e.next] });
  await client.call({ account: safe, to: rolesAddr, data: grant }).catch(() => fail(`${e.name}: simulating grantRole as the Safe reverted`));
  transactions.grant.push({ to: rolesAddr, value: '0', data: grant, contractMethod: null, contractInputsValues: null });

  const oldHolds = e.old ? await client.readContract({ address: rolesAddr, abi: ABI, functionName: 'hasRole', args: [roleHash[e.name], e.old] }) : false;
  if (oldHolds) {
    const revoke = encodeFunctionData({ abi: ABI, functionName: 'revokeRole', args: [roleHash[e.name], e.old] });
    await client.call({ account: safe, to: rolesAddr, data: revoke }).catch(() => fail(`${e.name}: simulating revokeRole as the Safe reverted`));
    transactions.revoke.push({ to: rolesAddr, value: '0', data: revoke, contractMethod: null, contractInputsValues: null });
  } else {
    console.log(`note: ${e.name} — ${e.old ?? 'the recorded holder'} no longer holds the role on-chain, so there is nothing to revoke`);
  }
}

const outDir = path.resolve(value('out') || path.join(root, 'contracts', 'broadcast', 'role-rotation'));
fs.mkdirSync(outDir, { recursive: true });
const batch = (name, description, txs) => ({
  version: '1.0',
  chainId: String(baseSepolia.id),
  createdAt: Date.now(),
  meta: { name, description, txBuilderVersion: '1.17.0', createdFromSafeAddress: safe, createdFromOwnerAddress: '' },
  transactions: txs,
});
fs.writeFileSync(path.join(outDir, 'roles-1-grant.json'), JSON.stringify(batch('Roles: grant to the real operators', 'grantRole for each operational role. Run first, then confirm every new holder can act.', transactions.grant), null, 2));
fs.writeFileSync(path.join(outDir, 'roles-2-revoke.json'), JSON.stringify(batch('Roles: revoke the simulation identities', 'revokeRole for each retired holder. Run only after the new holders are confirmed.', transactions.revoke), null, 2));

console.log(`\nSimulated as the Safe ${safe}: every call succeeds.\n`);
for (const e of entries) console.log(`  ${e.name.padEnd(26)} ${e.old ?? '-'}  ->  ${e.next}`);
console.log(`\nWrote ${path.join(outDir, 'roles-1-grant.json')} (${transactions.grant.length} calls)`);
console.log(`Wrote ${path.join(outDir, 'roles-2-revoke.json')} (${transactions.revoke.length} calls)`);
console.log('\nSafe → Apps → Transaction Builder → drop the grant file, review, sign, execute. Confirm each new holder works, then the same with the revoke file.');
console.log('Afterwards: node scripts/prepare-role-rotation.mjs --plan <plan> --check');
