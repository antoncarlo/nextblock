/**
 * AI connection preflight — READ-ONLY. Sends nothing, signs nothing.
 *
 *   node --experimental-strip-types app/scripts/ai-preflight.ts
 *   node --experimental-strip-types app/scripts/ai-preflight.ts --publisher 0xNODE
 *   node --experimental-strip-types app/scripts/ai-preflight.ts --publisher 0xNODE --retire 0xOLD
 *
 * Reports whether the AI feed can be switched on: vendor settings, the on-chain
 * guards the feed will run under, who holds ORACLE_ROLE today, and the state of each
 * vault's NAV feed. With --publisher it also simulates, as the governance Safe, the
 * grant of ORACLE_ROLE to the node's address and prints the exact Safe transaction;
 * --retire adds the matching revoke for the identity being replaced.
 *
 * Env (all optional): BRAINO_BASE_URL, BRAINO_HMAC_SECRET, AI_ASSESSOR_PROVIDER,
 * BASE_SEPOLIA_RPC_URL.
 */

import { createPublicClient, encodeFunctionData, http, parseAbi, parseAbiItem, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import { brainoConfigFromEnv } from '../src/lib/braino/client.ts';
import { NEXTBLOCK_ADDRESSES as A, NEXTBLOCK_ROLES as R } from '../src/config/generated/addressBook.ts';

const ROLES_ABI = parseAbi([
  'function ORACLE_ROLE() view returns (bytes32)',
  'function OWNER_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function getRoleAdmin(bytes32 role) view returns (bytes32)',
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
]);
const ROLE_GRANTED = parseAbiItem('event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)');
const ROLE_REVOKED = parseAbiItem('event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)');
const NAV_ABI = parseAbi([
  'function maxStaleness() view returns (uint64)',
  'function maxDeviationBps() view returns (uint256)',
  'function minConfidenceBps() view returns (uint16)',
  'function vaultFeedPaused(address vault) view returns (bool)',
]);
const FACTORY_ABI = parseAbi(['function getVaults() view returns (address[])']);
const LENS_ABI = parseAbi([
  'function getVaultDashboard(address vault) view returns ((uint8 schemaVersion, uint8 status, address vault, string name, address manager, uint256 totalAssets, uint256 totalShares, uint256 sharePrice, uint256 balance, uint256 unearnedPremiums, uint256 pendingClaims, uint256 deployedCapital, uint256 portfolioAllocated, uint256 availableBuffer, uint256 underwritingCapacity, uint256 depositCap, uint256 bufferRatioBps, uint256 managementFeeBps, uint256 accumulatedFees, address boundClaimManager, address boundVaultAllocator))',
]);

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const arg = (name: string): string | null => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};

let blockers = 0;
const ok = (m: string) => console.log(`  [ok]      ${m}`);
const todo = (m: string) => { blockers += 1; console.log(`  [to do]   ${m}`); };
const info = (m: string) => console.log(`  [info]    ${m}`);

async function main() {
  const publisher = arg('--publisher');
  const retire = arg('--retire');
  for (const [flag, v] of [['--publisher', publisher], ['--retire', retire]] as const) {
    if (v !== null && !ADDRESS_RE.test(v)) {
      console.error(`${flag} must be a 0x…40-hex address`);
      process.exit(2);
    }
  }

  const rpc = process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
  const c = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  const roles = A.protocolRoles as Address;
  const nav = A.navOracle as Address;

  console.log('1. Vendor settings');
  const provider = (process.env.AI_ASSESSOR_PROVIDER ?? 'mock').toLowerCase();
  const cfg = brainoConfigFromEnv(process.env);
  if (cfg.ok) ok('BRAINO_BASE_URL and BRAINO_HMAC_SECRET are set and valid');
  else for (const p of cfg.problems) todo(p);
  if (provider === 'braino') ok('AI_ASSESSOR_PROVIDER=braino');
  else todo(`AI_ASSESSOR_PROVIDER is "${provider}"; set it to braino on Vercel once the vendor is live`);

  console.log('\n2. On-chain guards the feed runs under (NavOracle)');
  const [maxStaleness, maxDeviationBps, minConfidenceBps] = await Promise.all([
    c.readContract({ address: nav, abi: NAV_ABI, functionName: 'maxStaleness' }),
    c.readContract({ address: nav, abi: NAV_ABI, functionName: 'maxDeviationBps' }),
    c.readContract({ address: nav, abi: NAV_ABI, functionName: 'minConfidenceBps' }),
  ]);
  info(`a NAV older than ${maxStaleness}s ( ${Number(maxStaleness) / 3600} h ) is rejected by every consumer; the keeper republishes at least every 6 h`);
  info(`a move beyond ${maxDeviationBps} bps pauses the feed; the keeper withholds such a figure for a Sentinel to review`);
  info(`confidence below ${minConfidenceBps} bps is rejected on-chain`);

  console.log('\n3. Who can publish (ORACLE_ROLE)');
  const oracleRole = await c.readContract({ address: roles, abi: ROLES_ABI, functionName: 'ORACLE_ROLE' });
  const fromBlock = 47_584_430n; // first block of the current generation
  const latest = await c.getBlockNumber();
  type RoleEvent = { kind: 'grant' | 'revoke'; who: Address; at: bigint; i: number };
  const scan = async (from: bigint, to: bigint): Promise<RoleEvent[]> => {
    const [granted, revoked] = await Promise.all([
      c.getLogs({ address: roles, event: ROLE_GRANTED, args: { role: oracleRole }, fromBlock: from, toBlock: to }),
      c.getLogs({ address: roles, event: ROLE_REVOKED, args: { role: oracleRole }, fromBlock: from, toBlock: to }),
    ]);
    return [
      ...granted.map((l) => ({ kind: 'grant' as const, who: l.args.account as Address, at: l.blockNumber!, i: l.logIndex! })),
      ...revoked.map((l) => ({ kind: 'revoke' as const, who: l.args.account as Address, at: l.blockNumber!, i: l.logIndex! })),
    ];
  };

  // One wide request where the RPC allows it; public RPCs cap eth_getLogs at 1,000
  // blocks, so otherwise walk the range in windows, up to a bound.
  let events: RoleEvent[] | null = null;
  try {
    events = await scan(fromBlock, latest);
  } catch {
    const WINDOW = 1000n;
    const MAX_WINDOWS = 150n;
    if ((latest - fromBlock) / WINDOW <= MAX_WINDOWS) {
      const starts: bigint[] = [];
      for (let b = fromBlock; b <= latest; b += WINDOW) starts.push(b);
      events = [];
      for (let k = 0; k < starts.length; k += 6) {
        const batch = await Promise.all(
          starts.slice(k, k + 6).map((st) => scan(st, st + WINDOW - 1n > latest ? latest : st + WINDOW - 1n)),
        );
        for (const part of batch) events.push(...part);
      }
    }
  }

  const holders = new Set<string>();
  if (events) {
    events.sort((x, y) => (x.at === y.at ? x.i - y.i : x.at < y.at ? -1 : 1));
    for (const e of events) {
      if (e.kind === 'grant') holders.add(e.who.toLowerCase());
      else holders.delete(e.who.toLowerCase());
    }
    if (holders.size === 0) todo('nobody holds ORACLE_ROLE');
  } else {
    info('the range is too wide for this RPC to list every holder; set BASE_SEPOLIA_RPC_URL to a provider that allows wide log ranges for the full list');
    const simulation = R.oracleNode as Address;
    const simHolds = await c.readContract({ address: roles, abi: ROLES_ABI, functionName: 'hasRole', args: [oracleRole, simulation] });
    if (simHolds) holders.add(simulation.toLowerCase());
  }
  for (const h of holders) {
    const isSim = h === (R.oracleNode as string).toLowerCase();
    info(`${h}${isSim ? '  (the simulation identity from the redeploy, not a production node)' : ''}`);
  }
  if (publisher) {
    const has = await c.readContract({ address: roles, abi: ROLES_ABI, functionName: 'hasRole', args: [oracleRole, publisher as Address] });
    if (has) ok(`${publisher} already holds ORACLE_ROLE`);
    else todo(`${publisher} does not hold ORACLE_ROLE yet — see the Safe transaction below`);
  } else {
    todo('no publisher chosen: generate a dedicated key for the node and re-run with --publisher <its address>');
  }

  console.log('\n4. NAV feeds');
  const vaults = await c.readContract({ address: A.vaultFactory as Address, abi: FACTORY_ABI, functionName: 'getVaults' });
  for (const v of vaults) {
    const [dash, paused] = await Promise.all([
      c.readContract({ address: A.lens as Address, abi: LENS_ABI, functionName: 'getVaultDashboard', args: [v] }),
      c.readContract({ address: nav, abi: NAV_ABI, functionName: 'vaultFeedPaused', args: [v] }),
    ]);
    const empty = dash.totalAssets === 0n && dash.totalShares === 0n;
    info(`${v}  ${dash.name}  assets ${dash.totalAssets}  ${paused ? 'FEED PAUSED' : 'feed open'}${empty ? '  (empty: nothing to attest yet)' : ''}`);
  }

  if (publisher) {
    console.log('\n5. Safe transaction (governance Safe, direct, no timelock needed for a grant)');
    const safe = A.safe as Address;
    const admin = await c.readContract({ address: roles, abi: ROLES_ABI, functionName: 'getRoleAdmin', args: [oracleRole] });
    const safeIsAdmin = await c.readContract({ address: roles, abi: ROLES_ABI, functionName: 'hasRole', args: [admin, safe] });
    if (safeIsAdmin) ok(`the Safe ${safe} administers ORACLE_ROLE`);
    else todo(`the Safe does not hold the admin role of ORACLE_ROLE; the grant must go through the timelock`);

    const calls: Array<{ label: string; data: `0x${string}` }> = [
      { label: `grant ORACLE_ROLE to ${publisher}`, data: encodeFunctionData({ abi: ROLES_ABI, functionName: 'grantRole', args: [oracleRole, publisher as Address] }) },
    ];
    if (retire) calls.push({ label: `revoke ORACLE_ROLE from ${retire}`, data: encodeFunctionData({ abi: ROLES_ABI, functionName: 'revokeRole', args: [oracleRole, retire as Address] }) });

    for (const call of calls) {
      try {
        await c.call({ account: safe, to: roles, data: call.data });
        ok(`simulated as the Safe: ${call.label} would succeed`);
      } catch {
        todo(`simulation as the Safe FAILED: ${call.label}`);
      }
    }
    console.log('\n  Safe → Transaction Builder → Custom data, one transaction each:');
    for (const call of calls) {
      console.log(`    ${call.label}`);
      console.log(`      To:    ${roles}`);
      console.log('      Value: 0');
      console.log(`      Data:  ${call.data}`);
    }
    if (retire) info('Retiring the simulation identity stops the agent simulation from publishing; do it only when the real node is running.');
  }

  console.log(blockers === 0 ? '\nREADY: nothing left to do before switching the feed on.' : `\nNOT READY: ${blockers} item(s) above marked [to do].`);
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
