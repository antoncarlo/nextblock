/**
 * NAV keeper — pulls each vault's NAV from Braino (spec S1) and publishes it on-chain.
 *
 *   node --experimental-strip-types app/scripts/nav-keeper.ts
 *
 * Env:
 *   BRAINO_BASE_URL       vendor API base (https)                         [required]
 *   BRAINO_HMAC_SECRET    shared secret for X-Braino-Signature            [required]
 *   BRAINO_API_KEY        bearer credential, if the vendor issues one     [optional]
 *   ORACLE_PRIVATE_KEY    key holding ORACLE_ROLE (never the deployer)    [required to broadcast]
 *   BASE_SEPOLIA_RPC_URL  RPC endpoint                                    [default public]
 *   DRY_RUN=1             fetch, verify and decide; do not broadcast
 *
 * Per vault: read the Lens dashboard -> POST /v1/nav -> verify the signature and the
 * figure -> compare with the guards that live on-chain -> publishNav -> read back.
 *
 * Exit status: 0 when every vault was published, skipped as unchanged, or empty;
 * 1 when anything needs a person (a NAV withheld because it would trip the deviation
 * guard or because the feed is paused, a vendor failure, a failed publish);
 * 2 when the keeper itself is not configured. The workflow goes red on 1 and 2, which
 * is the alert: the owner is told by e-mail, nothing is retried silently.
 *
 * Authority: the keeper holds ORACLE_ROLE and nothing else. It cannot move funds,
 * approve a claim, or unpause a feed; the on-chain guards stay the final authority.
 */

import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { brainoConfigFromEnv, decideNavPublish, fetchNav, BrainoError } from '../src/lib/braino/client.ts';
import { NEXTBLOCK_ADDRESSES } from '../src/config/generated/addressBook.ts';
import type { CanonicalValue } from '../src/lib/oracle-node.ts';

const FACTORY_ABI = parseAbi(['function getVaults() view returns (address[])']);

const LENS_ABI = parseAbi([
  'struct VaultDashboardView { uint8 schemaVersion; uint8 status; address vault; string name; address manager; uint256 totalAssets; uint256 totalShares; uint256 sharePrice; uint256 balance; uint256 unearnedPremiums; uint256 pendingClaims; uint256 deployedCapital; uint256 portfolioAllocated; uint256 availableBuffer; uint256 underwritingCapacity; uint256 depositCap; uint256 bufferRatioBps; uint256 managementFeeBps; uint256 accumulatedFees; address boundClaimManager; address boundVaultAllocator; }',
  'function getVaultDashboard(address vault) view returns (VaultDashboardView v)',
]);

const NAV_ABI = parseAbi([
  'struct NavAttestation { uint256 nav; uint16 confidenceBps; uint64 updatedAt; bytes32 sourceHash; }',
  'function tryGetNav(address vault) view returns (bool valid, NavAttestation att)',
  'function vaultFeedPaused(address vault) view returns (bool)',
  'function deviationWaiver(address vault) view returns (bool)',
  'function maxDeviationBps() view returns (uint256)',
  'function publishNav(address vault, uint256 nav, uint16 confidenceBps, bytes32 sourceHash)',
]);

const DATA_STATUS_AVAILABLE = 2;

/** The Lens dashboard as the JSON the vendor receives: bigints become decimal strings. */
function snapshotOf(dash: Record<string, unknown>): Record<string, CanonicalValue> {
  const out: Record<string, CanonicalValue> = {};
  for (const [k, v] of Object.entries(dash)) {
    if (typeof v === 'bigint') out[k] = v.toString();
    else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

type Outcome = 'published' | 'dry-run' | 'skipped' | 'empty' | 'withheld' | 'failed';

async function main() {
  const cfg = brainoConfigFromEnv(process.env);
  if (!cfg.ok) {
    console.error(`NAV keeper is not configured:\n  - ${cfg.problems.join('\n  - ')}`);
    process.exit(2);
  }
  const dryRun = process.env.DRY_RUN === '1';
  const pk = process.env.ORACLE_PRIVATE_KEY;
  if (!dryRun && (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk))) {
    console.error('ORACLE_PRIVATE_KEY unset or malformed — refusing to broadcast (DRY_RUN=1 to fetch and decide only).');
    process.exit(2);
  }

  const rpc = process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  const account = pk ? privateKeyToAccount(pk as Hex) : null;
  const wallet = account ? createWalletClient({ account, chain: baseSepolia, transport: http(rpc) }) : null;

  const factory = NEXTBLOCK_ADDRESSES.vaultFactory as `0x${string}`;
  const lens = NEXTBLOCK_ADDRESSES.lens as `0x${string}`;
  const oracle = NEXTBLOCK_ADDRESSES.navOracle as `0x${string}`;

  const vaults = await publicClient.readContract({ address: factory, abi: FACTORY_ABI, functionName: 'getVaults' });
  const maxDeviationBps = await publicClient.readContract({ address: oracle, abi: NAV_ABI, functionName: 'maxDeviationBps' });
  console.log(`${vaults.length} vault(s); deviation guard ${maxDeviationBps} bps; ${dryRun ? 'DRY RUN' : `publisher ${account!.address}`}`);

  const results: Array<{ vault: string; outcome: Outcome; note: string }> = [];

  for (const vault of vaults) {
    const record = (outcome: Outcome, note: string) => {
      results.push({ vault, outcome, note });
      console.log(`${vault}  ${outcome.padEnd(9)} ${note}`);
    };
    try {
      const dash = await publicClient.readContract({ address: lens, abi: LENS_ABI, functionName: 'getVaultDashboard', args: [vault] });
      if (dash.status !== DATA_STATUS_AVAILABLE) {
        record('failed', `Lens status ${dash.status}, not AVAILABLE`);
        continue;
      }
      // A vault with no assets and no shares has no NAV to attest.
      if (dash.totalAssets === 0n && dash.totalShares === 0n) {
        record('empty', 'no assets, no shares');
        continue;
      }

      const [navState, feedPaused, waiver] = await Promise.all([
        publicClient.readContract({ address: oracle, abi: NAV_ABI, functionName: 'tryGetNav', args: [vault] }),
        publicClient.readContract({ address: oracle, abi: NAV_ABI, functionName: 'vaultFeedPaused', args: [vault] }),
        publicClient.readContract({ address: oracle, abi: NAV_ABI, functionName: 'deviationWaiver', args: [vault] }),
      ]);
      const att = navState[1];
      const hasPrior = att.updatedAt !== 0n;

      const nav = await fetchNav(cfg.config, {
        chainId: baseSepolia.id,
        vaultAddress: vault,
        snapshot: snapshotOf(dash as unknown as Record<string, unknown>),
      });

      const decision = decideNavPublish({
        newNav: nav.args.nav,
        lastNav: hasPrior ? att.nav : null,
        lastUpdatedAt: hasPrior ? Number(att.updatedAt) : null,
        feedPaused,
        deviationWaiver: waiver,
        maxDeviationBps,
        nowSeconds: Math.floor(Date.now() / 1000),
      });

      if (decision.action === 'skip') {
        record('skipped', `unchanged at ${att.nav}`);
        continue;
      }
      if (decision.action === 'withhold') {
        record(
          'withheld',
          decision.reason === 'feed_paused'
            ? 'feed is paused: a Sentinel must review and unpause before a NAV is accepted'
            : `${nav.args.nav} is ${decision.deviationBps} bps from ${att.nav} (guard ${maxDeviationBps}): Sentinel must acknowledgeDeviation first`,
        );
        continue;
      }

      if (dryRun || !wallet) {
        record('dry-run', `would publish ${nav.args.nav} (${decision.reason}), report ${nav.reportId}, hash ${nav.args.sourceHash}`);
        continue;
      }

      const hash = await wallet.writeContract({
        address: oracle,
        abi: NAV_ABI,
        functionName: 'publishNav',
        args: [vault, nav.args.nav, nav.args.confidenceBps, nav.args.sourceHash],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        record('failed', `publish reverted in ${hash}`);
        continue;
      }
      // A receipt is not proof the figure was applied (a guard can accept the call and
      // decline the value): read it back.
      const after = (await publicClient.readContract({ address: oracle, abi: NAV_ABI, functionName: 'tryGetNav', args: [vault] }))[1];
      if (after.nav !== nav.args.nav || after.sourceHash !== nav.args.sourceHash) {
        record('failed', `tx ${hash} mined but the figure was not applied`);
        continue;
      }
      record('published', `${nav.args.nav} (${decision.reason}), report ${nav.reportId}, tx ${hash}`);
    } catch (err) {
      const note = err instanceof BrainoError ? `braino ${err.code}: ${err.message}` : err instanceof Error ? err.message.split('\n')[0] : 'error';
      record('failed', note);
    }
  }

  const needsAttention = results.some((r) => r.outcome === 'failed' || r.outcome === 'withheld');
  console.log(needsAttention ? '\nATTENTION: at least one vault needs a person.' : '\nOK');
  process.exit(needsAttention ? 1 : 0);
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
