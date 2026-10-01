/**
 * The L3 campaign, against Base Sepolia.
 *
 * The same run loop as the Anvil campaign, pointed at staging with the real
 * simulation identities. The keys are read from `.sim-keys.json` at run time on
 * the operator's machine — this file never contains one and never prints one.
 *
 * It assumes the two setup steps that come before it have already run:
 *   fund-sim-wallets.mjs   — ETH and USDC to the 26 identities
 *   grant-sim-roles.mjs    — the ten roles to the simulation roster
 * Without those, every role-gated action is refused for lack of a role and the
 * run is a page of false findings. This script checks neither: they are the
 * operator's to run, and re-checking them here would only duplicate the guards
 * those scripts already carry.
 *
 * What it does do before the campaign is confirm the secret file and the public
 * key map came from the same seed, and onboard the LPs through the KYC
 * operator's key. Both are cheap and both prevent a whole run of false findings.
 *
 *   export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
 *   node --experimental-strip-types src/bin/live-l3.ts \
 *     --map <keys.map.json> --secret <.sim-keys.json> \
 *     --deployment <84532-staging.json> [--actions 300]
 */

import { readFileSync } from 'node:fs';
import { createWalletClient, createPublicClient, http, parseAbi, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

import { makeStagingClient, loadSimKeys, assertSeedMatches } from '../adapters/staging.ts';
import type { Deployment } from '../adapters/anvil.ts';
import { buildRoster, type Addresses, type AgentSpec } from '../agents/roster.ts';
import type { RoleId } from '../agents/types.ts';
import { runScenario } from '../runner.ts';
import { SCENARIOS } from '../scenarios/index.ts';
import { emptyState } from '../shadow/ledger.ts';
import { toJUnit, type Finding } from '../report/finding.ts';

const BASE_SEPOLIA = 84_532;

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

const rpcUrlRaw = process.env.BASE_SEPOLIA_RPC_URL ?? process.env.RPC_URL;
if (!rpcUrlRaw) throw new Error('BASE_SEPOLIA_RPC_URL is not set');
const rpcUrl: string = rpcUrlRaw;

const mapFile = arg('map');
const secretFile = arg('secret');
const deploymentFile = arg('deployment');
const maxActions = Number(arg('actions', '300'));

const keyMap = JSON.parse(readFileSync(mapFile, 'utf8'));
const dep = JSON.parse(readFileSync(deploymentFile, 'utf8'));
const usdcAddr = (dep.usdc ?? dep.mockUSDC) as Address;

// Confirm the two files are from one seed before anything is signed. A map
// paired with the wrong secret would sign as the wrong addresses and every
// action would be refused — a whole campaign of false findings this prevents.
assertSeedMatches(secretFile, keyMap.mnemonicFingerprint);

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

/** Role name in the key map to the RoleId the roster uses. */
const ROLE_ID: Record<string, RoleId> = {
  UNDERWRITING_CURATOR_ROLE: 'UNDERWRITING_CURATOR',
  ALLOCATOR_ROLE: 'ALLOCATOR',
  SENTINEL_ROLE: 'SENTINEL',
  CLAIMS_COMMITTEE_ROLE: 'CLAIMS_COMMITTEE',
  AUTHORIZED_CEDANT_ROLE: 'AUTHORIZED_CEDANT',
  PREMIUM_DEPOSITOR_ROLE: 'PREMIUM_DEPOSITOR',
  KYC_OPERATOR_ROLE: 'KYC_OPERATOR',
  ORACLE_ROLE: 'ORACLE',
};

/** Role name to the agent family that drives it. */
const FAMILY: Record<string, string> = {
  UNDERWRITING_CURATOR_ROLE: 'A2',
  ALLOCATOR_ROLE: 'A3',
  SENTINEL_ROLE: 'A4',
  CLAIMS_COMMITTEE_ROLE: 'A5',
  AUTHORIZED_CEDANT_ROLE: 'A6',
  PREMIUM_DEPOSITOR_ROLE: 'A7',
  KYC_OPERATOR_ROLE: 'A8',
  ORACLE_ROLE: 'A9',
};

/**
 * Builds the roster from the public key map.
 *
 * A1 (governance) and A10 (factory) are left out on staging for the same
 * reasons they were on Anvil: A1 needs the timelock's proposer path set up, and
 * A10 needs a second curator the roster does not carry. The eight role holders,
 * the LPs and the keepers are the machine that produces volume.
 */
function rosterFromMap(): AgentSpec[] {
  const specs: AgentSpec[] = [];
  for (const a of keyMap.accounts) {
    if (a.role && FAMILY[a.role]) {
      specs.push({ id: `${FAMILY[a.role]}-${a.id}`, role: ROLE_ID[a.role]!, address: a.address });
    } else if (a.group === 'lp' || a.group === 'lp-smart') {
      specs.push({ id: `A11-${a.id}`, role: null, address: a.address });
    } else if (a.group === 'keeper') {
      specs.push({ id: `A12-${a.id}`, role: null, address: a.address });
    }
    // governance and adversary are deliberately not active agents.
  }
  return specs;
}

const COMPLIANCE_ABI = parseAbi([
  'function setWhitelist(address user, bool allowed)',
  'function setKycExpiry(address user, uint64 expiry)',
  'function canReceive(address) view returns (bool)',
]);

async function main() {
  const specs = rosterFromMap();
  const lps = specs.filter((s) => s.id.startsWith('A11')).map((s) => s.address);

  // The keys, read once, kept nowhere else. loadSimKeys validates their shape
  // and never echoes a value.
  const keys = loadSimKeys(secretFile);

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== BASE_SEPOLIA) {
    throw new Error(`the endpoint reports chain ${chainId}, not Base Sepolia (${BASE_SEPOLIA})`);
  }

  // Onboard the LPs through the KYC operator, whose key is among those loaded.
  // Done here rather than by an agent because it is a precondition of the run,
  // not an action under test: an LP that cannot subscribe makes A11 a no-op.
  const kycAccount = keyMap.accounts.find((a: { role?: string }) => a.role === 'KYC_OPERATOR_ROLE');
  const kycKey = keys.find((k) => privateKeyToAccount(k).address.toLowerCase() === kycAccount.address.toLowerCase());
  if (!kycKey) throw new Error('the KYC operator key is not in the secret file');
  const kyc = createWalletClient({ account: privateKeyToAccount(kycKey), chain: baseSepolia, transport: http(rpcUrl) });
  const wait = (hash: `0x${string}`) => publicClient.waitForTransactionReceipt({ hash });

  console.log(`onboarding ${lps.length} LPs through the KYC operator...`);
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);
  for (const lp of lps) {
    const eligible = await publicClient.readContract({ address: dep.complianceRegistry, abi: COMPLIANCE_ABI, functionName: 'canReceive', args: [lp] });
    if (eligible) continue;
    await wait(await kyc.writeContract({ address: dep.complianceRegistry, abi: COMPLIANCE_ABI, functionName: 'setWhitelist', args: [lp, true] } as never));
    await wait(await kyc.writeContract({ address: dep.complianceRegistry, abi: COMPLIANCE_ABI, functionName: 'setKycExpiry', args: [lp, expiry] } as never));
  }

  const deployment: Deployment = {
    vault: dep.vault, vaultAllocator: dep.vaultAllocator, claimManager: dep.claimManager,
    complianceRegistry: dep.complianceRegistry, portfolioRegistry: dep.portfolioRegistry,
    navOracle: dep.navOracle, vaultFactory: dep.vaultFactory, mockUSDC: usdcAddr,
  };

  const client = makeStagingClient(rpcUrl, deployment, addr, lps[0]!, keys);
  const agents = buildRoster(specs, addr);

  console.log(`\nrunning ${maxActions} actions across ${agents.length} agents on Base Sepolia...\n`);
  const result = await runScenario(client, {
    scenario: SCENARIOS.S1,
    seed: `l3-${Date.now()}`,
    chainId: BASE_SEPOLIA,
    agents,
    trackedVault: dep.vault,
    maxActions,
    shadow: emptyState(),
  });

  const harness = result.findings.filter((f: Finding) => (f.observed ?? '').startsWith('HARNESS'));
  const protocol = result.findings.filter((f: Finding) => !(f.observed ?? '').startsWith('HARNESS'));

  console.log(`actions attempted: ${result.actionsAttempted}`);
  console.log(`halted early:      ${result.haltedEarly}`);
  console.log(`protocol findings: ${protocol.length}`);
  console.log(`harness findings:  ${harness.length}`);

  const byKind = new Map<string, number>();
  for (const f of protocol) byKind.set(`${f.severity} ${f.kind}`, (byKind.get(`${f.severity} ${f.kind}`) ?? 0) + 1);
  for (const [k, n] of [...byKind.entries()].sort()) console.log(`  ${k}: ${n}`);

  if (protocol.length > 0) {
    console.log('\n--- JUnit ---');
    console.log(toJUnit(protocol, 'live-base-sepolia'));
  }

  process.exit(protocol.some((f) => f.severity === 'P0' || f.severity === 'P1') ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
