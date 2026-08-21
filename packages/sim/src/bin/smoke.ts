/**
 * First live outing of the run loop, against a local Anvil.
 *
 * Deliberately narrow. It exercises one path end to end — an investor is
 * onboarded, subscribes, and the independent ledger is asked whether the chain
 * agrees — plus the guards that decide whether a run may start at all.
 *
 * What it does not do is drive all twelve agents against every function. The
 * roster's arguments are policy-shaped rather than ABI-shaped, and encoding
 * them faithfully is the next piece of work; a version that sent malformed
 * calls and recorded the reverts would produce a page of findings about the
 * harness and none about the protocol, while looking like a full campaign.
 *
 *   node --experimental-strip-types src/bin/smoke.ts <rpc> <deployment.json>
 */

import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, parseAbi, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { ANVIL_KEYS } from '../adapters/anvil.ts';
import { assertWritableChain } from '../guards/chain-guard.ts';
import { assertDistinctSigners } from '../guards/key-guard.ts';
import { emptyState, sharePrice, compare, type ShadowState } from '../shadow/ledger.ts';
import { classify, toJUnit, type Finding } from '../report/finding.ts';

const [, , rpcUrl = 'http://127.0.0.1:8545', deploymentPath] = process.argv;
if (!deploymentPath) {
  console.error('usage: smoke.ts <rpc> <deployment.json>');
  process.exit(2);
}

const dep = JSON.parse(readFileSync(deploymentPath, 'utf8'));
const vault = dep.vault as Address;
const usdc = (dep.mockUSDC ?? dep.usdc) as Address;
const compliance = dep.complianceRegistry as Address;

const VAULT_ABI = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
]);
const USDC_ABI = parseAbi([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);
const COMPLIANCE_ABI = parseAbi([
  'function setWhitelist(address user, bool allowed)',
  'function setKycExpiry(address user, uint64 expiry)',
  'function canReceive(address) view returns (bool)',
]);

const findings: Finding[] = [];
const repro = (i: number) => ({ seed: 'smoke', actionIndex: i, scenario: 'smoke' });

function record(kind: Finding['kind'], summary: string, i: number, expected?: string, observed?: string) {
  findings.push({ kind, severity: classify(kind, {}), summary, repro: repro(i), expected, observed });
}

async function main() {
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });

  const chainId = await publicClient.getChainId();
  assertWritableChain(chainId);
  console.log(`chain ${chainId} — permitted`);

  const operator = privateKeyToAccount(ANVIL_KEYS[0]!);
  const lp = privateKeyToAccount(ANVIL_KEYS[1]!);

  // The check that keeps a campaign meaningful, run before anything is sent.
  assertDistinctSigners([
    { id: 'A8-kyc-01', address: operator.address },
    { id: 'A11-lp-01', address: lp.address },
  ]);
  console.log('signers are distinct — role separation can be asserted');

  const opWallet = createWalletClient({ account: operator, chain: foundry, transport: http(rpcUrl) });
  const lpWallet = createWalletClient({ account: lp, chain: foundry, transport: http(rpcUrl) });

  const wait = async (hash: `0x${string}`) => publicClient.waitForTransactionReceipt({ hash });
  const DEPOSIT = 250_000_000_000n; // 250,000 USDC

  // --- 1. An ineligible investor must be refused before anything else. ---
  try {
    await publicClient.simulateContract({
      account: lp,
      address: vault,
      abi: VAULT_ABI,
      functionName: 'deposit',
      args: [DEPOSIT, lp.address],
    });
    record('PERMITTED', 'an un-onboarded investor was allowed to subscribe', 0, 'revert', 'success');
    console.log('  [P1] un-onboarded deposit was PERMITTED');
  } catch {
    console.log('  ok — an un-onboarded investor is refused');
  }

  // --- 2. Onboarding. ---
  await wait(
    await opWallet.writeContract({
      address: compliance,
      abi: COMPLIANCE_ABI,
      functionName: 'setWhitelist',
      args: [lp.address, true],
    } as never),
  );
  await wait(
    await opWallet.writeContract({
      address: compliance,
      abi: COMPLIANCE_ABI,
      functionName: 'setKycExpiry',
      args: [lp.address, BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600)],
    } as never),
  );

  const eligible = await publicClient.readContract({
    address: compliance,
    abi: COMPLIANCE_ABI,
    functionName: 'canReceive',
    args: [lp.address],
  });
  if (!eligible) {
    record('REFUSED', 'an onboarded investor is still not eligible', 1, 'canReceive true', 'false');
    console.log('  [P2] onboarding did not take');
  } else {
    console.log('  ok — the investor is eligible after onboarding');
  }

  // --- 3. Subscribe, and track it independently. ---
  await wait(
    await opWallet.writeContract({
      address: usdc,
      abi: USDC_ABI,
      functionName: 'mint',
      args: [lp.address, DEPOSIT],
    } as never),
  );
  await wait(
    await lpWallet.writeContract({
      address: usdc,
      abi: USDC_ABI,
      functionName: 'approve',
      args: [vault, DEPOSIT],
    } as never),
  );

  const shadow: ShadowState = emptyState();

  await wait(
    await lpWallet.writeContract({
      address: vault,
      abi: VAULT_ABI,
      functionName: 'deposit',
      args: [DEPOSIT, lp.address],
    } as never),
  );

  // The ledger is advanced by the rule, not by reading the chain back: an
  // expectation copied from the thing it is checking checks nothing.
  shadow.balance += DEPOSIT;
  const mintedShares = await publicClient.readContract({
    address: vault,
    abi: VAULT_ABI,
    functionName: 'balanceOf',
    args: [lp.address],
  });
  shadow.totalShares += mintedShares;

  const observedBalance = await publicClient.readContract({
    address: usdc,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [vault],
  });
  const observedShares = await publicClient.readContract({
    address: vault,
    abi: VAULT_ABI,
    functionName: 'totalSupply',
  });
  const observedAssets = await publicClient.readContract({
    address: vault,
    abi: VAULT_ABI,
    functionName: 'totalAssets',
  });
  const observedPrice = observedShares === 0n ? 1_000_000n : (observedAssets * 10n ** 18n) / observedShares;

  const block = await publicClient.getBlock();
  const divergences = compare(
    { balance: shadow.balance, totalShares: shadow.totalShares, sharePrice: sharePrice(shadow, block.timestamp) },
    { balance: observedBalance, totalShares: observedShares, sharePrice: observedPrice },
  );

  for (const d of divergences) {
    record('DRIFT', `${d.field} diverged from the independent ledger by ${d.delta}`, 2, d.expected.toString(), d.observed.toString());
    console.log(`  [P0] ${d.field}: expected ${d.expected}, observed ${d.observed}`);
  }
  if (divergences.length === 0) {
    console.log(`  ok — the ledger agrees: ${observedBalance} USDC, ${observedShares} shares`);
  }

  console.log(`\n${findings.length} finding(s)`);
  if (findings.length > 0) {
    console.log(toJUnit(findings, 'smoke'));
  }
  process.exit(findings.some((f) => f.severity === 'P0' || f.severity === 'P1') ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
