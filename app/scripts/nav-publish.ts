/**
 * NAV publisher node — validates a provider report and publishes it on-chain.
 *
 *   node --experimental-strip-types app/scripts/nav-publish.ts <report.json> [signatureHex]
 *
 * Env:
 *   ORACLE_PRIVATE_KEY    key holding ORACLE_ROLE (never the deployer)  [required to broadcast]
 *   BASE_SEPOLIA_RPC_URL  RPC endpoint                                  [default public]
 *   BRAINO_HMAC_SECRET    shared secret; when set, the report file's RAW
 *                         bytes must verify against [signatureHex]      [optional until vendor onboards]
 *   DRY_RUN=1             validate + print args, no broadcast
 *
 * This is the publisher half of the Braino integration (spec §1: "NextBlock
 * calls Braino … adapter + publisher keeper"). Until the vendor delivers the
 * API, reports are hand-authored JSON files — the pipeline, validation,
 * evidence hash and broadcast are the real production path either way.
 * Fail-closed: no key → no broadcast; bad HMAC → refuse; stale → refuse.
 */

import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { verifyBrainoSignature, validateNavReport, type NavReport } from '../src/lib/oracle-node.ts';
import { NEXTBLOCK_ADDRESSES } from '../src/config/generated/addressBook.ts';

const NAV_ORACLE_ABI = [
  {
    type: 'function',
    name: 'publishNav',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'vault', type: 'address' },
      { name: 'nav', type: 'uint256' },
      { name: 'confidenceBps', type: 'uint16' },
      { name: 'sourceHash', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

async function main() {
  const [, , reportPath, signatureHex] = process.argv;
  if (!reportPath) {
    console.error('usage: node --experimental-strip-types app/scripts/nav-publish.ts <report.json> [signatureHex]');
    process.exit(2);
  }

  // 1. Raw bytes first: HMAC must verify the file exactly as received.
  const rawBody = readFileSync(reportPath);
  const secret = process.env.BRAINO_HMAC_SECRET;
  if (secret) {
    if (!verifyBrainoSignature(rawBody, signatureHex, secret)) {
      console.error('FAIL: X-Braino-Signature verification failed — refusing the report.');
      process.exit(1);
    }
    console.log('HMAC signature verified.');
  } else {
    console.log('NOTE: BRAINO_HMAC_SECRET unset — manual attestation mode (no provider auth).');
  }

  // 2. Validate + derive publish args (sourceHash anchors the whole report).
  const report = JSON.parse(rawBody.toString('utf8')) as NavReport;
  const validated = validateNavReport(report, Math.floor(Date.now() / 1000));
  if (!validated.ok) {
    console.error(`FAIL: invalid report:\n  - ${validated.errors.join('\n  - ')}`);
    process.exit(1);
  }
  const { vault, nav, confidenceBps, sourceHash } = validated.args;
  console.log(`vault:         ${vault}`);
  console.log(`nav:           ${nav} (USDC 6dp)`);
  console.log(`confidenceBps: ${confidenceBps}`);
  console.log(`sourceHash:    ${sourceHash}`);

  if (process.env.DRY_RUN === '1') {
    console.log('DRY_RUN=1 — no broadcast.');
    return;
  }

  // 3. Broadcast with the dedicated ORACLE_ROLE key (fail-closed without it).
  const pk = process.env.ORACLE_PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    console.error('FAIL: ORACLE_PRIVATE_KEY unset or malformed — refusing to broadcast (use DRY_RUN=1 to validate only).');
    process.exit(1);
  }
  const rpc = process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
  const account = privateKeyToAccount(pk as `0x${string}`);
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(rpc) });
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpc) });

  const hash = await wallet.writeContract({
    address: NEXTBLOCK_ADDRESSES.navOracle as `0x${string}`,
    abi: NAV_ORACLE_ABI,
    functionName: 'publishNav',
    args: [vault, nav, confidenceBps, sourceHash],
  });
  console.log(`tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`status: ${receipt.status} (block ${receipt.blockNumber})`);
  process.exit(receipt.status === 'success' ? 0 : 1);
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
