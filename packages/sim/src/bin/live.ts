/**
 * A real campaign against a local Anvil: the agents act, with real calldata.
 *
 * The smoke test proved one path. This drives the roster — every agent
 * planning, the encoder turning each plan into a call, the chain accepting or
 * refusing it, and the run loop grading the outcome against what the agent
 * declared it expected. It is the first time the twelve policies and the
 * contracts meet, and the encoder is what lets them: without it the roster's
 * policy-shaped arguments would reach the chain as malformed calls.
 *
 * One deliberate piece of setup stands between the deploy and the run. The
 * deploy script puts every role on the deployer, so out of the box eleven of
 * the twelve agents would be refused everything for lack of a role — a page of
 * findings about the harness. This script distributes the roles to distinct
 * accounts first, which is also what the key guard requires and what staging
 * will have to do for real. Governance (A1) is left out: its actions run
 * through the TimelockController's proposer path, which is its own setup and
 * not what this run is here to exercise.
 *
 * Known limits of this adapter, stated so the P2/P3 findings it produces are
 * read correctly. The adapter does not read each claim's real status — it
 * surfaces every claim as both pending and approved — so the committee and the
 * keeper are sometimes asked to act on a claim in the wrong state, and the
 * protocol correctly refuses. The live setup also does not call
 * setPortfolioVault, so premium is refused with VaultNotSet. Both are the
 * harness asking for something in a state that does not hold, not the protocol
 * misbehaving: every such refusal is graded P2 or P3, never P0 or P1, and
 * tightening the adapter is what removes them. What matters is that across
 * hundreds of real actions nothing moved value wrongly and the shadow ledger
 * never diverged.
 *
 *   node --experimental-strip-types src/bin/live.ts <rpc> <deployment.json> [actions]
 */

import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, parseAbi, keccak256, toHex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { ANVIL_KEYS, makeAnvilClient, type Deployment } from '../adapters/anvil.ts';
import { buildRoster, type Addresses, type AgentSpec } from '../agents/roster.ts';
import { runScenario } from '../runner.ts';
import { SCENARIOS } from '../scenarios/index.ts';
import { emptyState } from '../shadow/ledger.ts';
import { toJUnit } from '../report/finding.ts';

const [, , rpcUrl = 'http://127.0.0.1:8545', deploymentPath, actionsArg = '200'] = process.argv;
if (!deploymentPath) {
  console.error('usage: live.ts <rpc> <deployment.json> [actions]');
  process.exit(2);
}

const dep = JSON.parse(readFileSync(deploymentPath, 'utf8'));
const usdcAddr = (dep.usdc ?? dep.mockUSDC) as Address;
const maxActions = Number(actionsArg);

const role = (name: string) => keccak256(toHex(name));

const ROLES_ABI = parseAbi(['function grantRole(bytes32 role, address account)']);
const COMPLIANCE_ABI = parseAbi([
  'function setWhitelist(address user, bool allowed)',
  'function setKycExpiry(address user, uint64 expiry)',
]);
const USDC_ABI = parseAbi(['function mint(address to, uint256 amount)', 'function approve(address spender, uint256 amount) returns (bool)']);

// account 0 owns the deploy and hands out the roles; 1..9 take one role each;
// 10 is a second curator so A10 can create vaults; 11 is the LP.
const accounts = ANVIL_KEYS.map((k) => privateKeyToAccount(k));

const addr: Addresses = {
  vault: dep.vault,
  allocator: dep.vaultAllocator,
  claims: dep.claimManager,
  compliance: dep.complianceRegistry,
  portfolios: dep.portfolioRegistry,
  navOracle: dep.navOracle,
  factory: dep.vaultFactory,
  timelock: dep.protocolTimelock ?? dep.vault,
  distributor: dep.premiumDistributor,
};

const specs: AgentSpec[] = [
  { id: 'A2-curator-01', role: 'UNDERWRITING_CURATOR', address: accounts[2]!.address },
  { id: 'A3-allocator-01', role: 'ALLOCATOR', address: accounts[3]!.address },
  { id: 'A4-sentinel-01', role: 'SENTINEL', address: accounts[4]!.address },
  { id: 'A5-committee-01', role: 'CLAIMS_COMMITTEE', address: accounts[5]!.address },
  { id: 'A6-cedant-01', role: 'AUTHORIZED_CEDANT', address: accounts[6]!.address },
  { id: 'A7-premium-01', role: 'PREMIUM_DEPOSITOR', address: accounts[7]!.address },
  { id: 'A8-kyc-01', role: 'KYC_OPERATOR', address: accounts[8]!.address },
  { id: 'A9-oracle-01', role: 'ORACLE', address: accounts[9]!.address },
  { id: 'A10-factory-01', role: 'VAULT_FACTORY', address: accounts[10]!.address },
  { id: 'A11-lp-01', role: null, address: accounts[11]!.address },
  { id: 'A12-keeper-01', role: null, address: accounts[1]!.address },
];

const GRANTS: [string, Address][] = [
  ['UNDERWRITING_CURATOR_ROLE', accounts[2]!.address],
  ['ALLOCATOR_ROLE', accounts[3]!.address],
  ['SENTINEL_ROLE', accounts[4]!.address],
  ['CLAIMS_COMMITTEE_ROLE', accounts[5]!.address],
  ['AUTHORIZED_CEDANT_ROLE', accounts[6]!.address],
  ['PREMIUM_DEPOSITOR_ROLE', accounts[7]!.address],
  ['KYC_OPERATOR_ROLE', accounts[8]!.address],
  ['ORACLE_ROLE', accounts[9]!.address],
  // A10 signs vault creation, which is curator-gated by design.
  ['UNDERWRITING_CURATOR_ROLE', accounts[10]!.address],
];

async function main() {
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
  const owner = createWalletClient({ account: accounts[0]!, chain: foundry, transport: http(rpcUrl) });
  const kyc = createWalletClient({ account: accounts[8]!, chain: foundry, transport: http(rpcUrl) });
  const lpWallet = createWalletClient({ account: accounts[11]!, chain: foundry, transport: http(rpcUrl) });
  const wait = (hash: `0x${string}`) => publicClient.waitForTransactionReceipt({ hash });

  // Anvil funds only its first ten accounts; the second curator (10) and the
  // LP (11) come with a zero balance and cannot pay for their own gas. Fund
  // them from account 0 before they are asked to sign anything.
  for (const i of [10, 11]) {
    await wait(await owner.sendTransaction({ to: accounts[i]!.address, value: 10n ** 18n } as never));
  }
  console.log('funded the accounts Anvil left empty');

  console.log('distributing roles to distinct accounts...');
  for (const [name, account] of GRANTS) {
    await wait(await owner.writeContract({ address: dep.protocolRoles, abi: ROLES_ABI, functionName: 'grantRole', args: [role(name), account] } as never));
  }
  console.log(`  ${GRANTS.length} roles granted across ${new Set(GRANTS.map((g) => g[1])).size} accounts`);

  // Onboard the LP through the account that now holds the KYC role.
  const lp = accounts[11]!.address;
  await wait(await kyc.writeContract({ address: dep.complianceRegistry, abi: COMPLIANCE_ABI, functionName: 'setWhitelist', args: [lp, true] } as never));
  await wait(await kyc.writeContract({ address: dep.complianceRegistry, abi: COMPLIANCE_ABI, functionName: 'setKycExpiry', args: [lp, BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600)] } as never));
  await wait(await owner.writeContract({ address: usdcAddr, abi: USDC_ABI, functionName: 'mint', args: [lp, 100_000_000_000_000n] } as never));
  await wait(await lpWallet.writeContract({ address: usdcAddr, abi: USDC_ABI, functionName: 'approve', args: [dep.vault, 100_000_000_000_000n] } as never));
  console.log('  LP onboarded and funded');

  const deployment: Deployment = {
    vault: dep.vault, vaultAllocator: dep.vaultAllocator, claimManager: dep.claimManager,
    complianceRegistry: dep.complianceRegistry, portfolioRegistry: dep.portfolioRegistry,
    navOracle: dep.navOracle, vaultFactory: dep.vaultFactory, mockUSDC: usdcAddr,
  };

  const client = makeAnvilClient(rpcUrl, deployment, addr, lp);
  const agents = buildRoster(specs, addr);

  console.log(`\nrunning ${maxActions} actions across ${agents.length} agents...\n`);
  const result = await runScenario(client, {
    scenario: SCENARIOS.S1,
    seed: `live-${Date.now()}`,
    chainId: 31_337,
    agents,
    trackedVault: dep.vault,
    maxActions,
    shadow: emptyState(),
  });

  // Separate what the run found about the protocol from what it found about
  // the harness: an encoding gap is ours, and counting it against the protocol
  // would be exactly the dishonesty the expect-field exists to prevent.
  const harness = result.findings.filter((f) => (f.observed ?? '').startsWith('HARNESS'));
  const protocol = result.findings.filter((f) => !(f.observed ?? '').startsWith('HARNESS'));

  console.log(`actions attempted: ${result.actionsAttempted}`);
  console.log(`halted early:      ${result.haltedEarly}`);
  console.log(`protocol findings: ${protocol.length}`);
  console.log(`harness findings:  ${harness.length}`);

  const byKind = new Map<string, number>();
  for (const f of protocol) byKind.set(`${f.severity} ${f.kind}`, (byKind.get(`${f.severity} ${f.kind}`) ?? 0) + 1);
  for (const [k, n] of [...byKind.entries()].sort()) console.log(`  ${k}: ${n}`);

  if (harness.length > 0) {
    console.log('\nharness gaps (encoder, not protocol):');
    for (const f of harness.slice(0, 5)) console.log(`  ${f.summary}: ${f.observed}`);
  }

  if (protocol.length > 0) {
    console.log('\n--- JUnit ---');
    console.log(toJUnit(protocol, 'live-anvil'));
  }

  // A P0 or P1 about the protocol is a real result and fails the run. Harness
  // gaps do not fail it — they are a to-do for the encoder, surfaced not buried.
  process.exit(protocol.some((f) => f.severity === 'P0' || f.severity === 'P1') ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
