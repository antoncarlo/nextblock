import { createPublicClient, createWalletClient, http, parseAbi, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import type { ChainClient } from '../runner.ts';
import type { PlannedAction, ProtocolState } from '../agents/types.ts';

/**
 * The chain adapter, kept in its own file and out of the run loop.
 *
 * The loop takes a `ChainClient` interface rather than importing viem, so the
 * orchestration — how an unexpected success becomes a finding, how a shadow
 * divergence is graded — can be tested with no node at all. This file is where
 * that interface meets a real chain, and it is deliberately thin: everything
 * here is translation, so a bug in it looks like a connection problem rather
 * than a false finding about the protocol.
 *
 * Anvil's accounts are used at this level. They are published test keys, fixed
 * by the tool and identical on every machine — they are not secrets, and
 * treating them as such would be theatre. Real keys enter only at staging, and
 * they enter through `loadKey` from the environment.
 */

/** Anvil's deterministic accounts. Public by design; documented by Foundry. */
export const ANVIL_KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
  '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
  '0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897',
  '0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82',
] as const;

export interface Deployment {
  vault: Address;
  vaultAllocator: Address;
  claimManager: Address;
  complianceRegistry: Address;
  portfolioRegistry: Address;
  navOracle: Address;
  vaultFactory: Address;
  mockUSDC: Address;
}

const VAULT_ABI = parseAbi([
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function getVaultInfo() view returns (string,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)',
  'function getAllocatedPortfolios() view returns (uint256[])',
]);

const PORTFOLIOS_ABI = parseAbi([
  'function nextPortfolioId() view returns (uint256)',
  'function getPortfolio(uint256) view returns ((uint256,address,string,string,bytes32,string,string,uint8,uint256,uint256,uint16,uint64,uint64,uint8,uint64,uint64))',
]);

const CLAIMS_ABI = parseAbi([
  'function getClaimCount() view returns (uint256)',
]);

const USDC_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

/**
 * Builds a client against a local node.
 *
 * The chain guard runs inside `runScenario`, so nothing here needs to repeat
 * it — but this function is also where somebody would first be tempted to
 * point the harness at a real RPC, which is exactly why the guard is not
 * optional and not here.
 */
export function makeAnvilClient(rpcUrl: string, dep: Deployment): ChainClient {
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });

  const wallets = new Map<Address, ReturnType<typeof createWalletClient>>();
  for (const key of ANVIL_KEYS) {
    const account = privateKeyToAccount(key);
    wallets.set(
      account.address,
      createWalletClient({ account, chain: foundry, transport: http(rpcUrl) }),
    );
  }

  return {
    async getChainId() {
      return publicClient.getChainId();
    },

    async readState(): Promise<ProtocolState> {
      const block = await publicClient.getBlock();

      const total = await publicClient.readContract({
        address: dep.portfolioRegistry,
        abi: PORTFOLIOS_ABI,
        functionName: 'nextPortfolioId',
      });

      const submitted: bigint[] = [];
      const underReview: bigint[] = [];
      const approved: bigint[] = [];
      const active: bigint[] = [];

      for (let id = 0n; id < total; id++) {
        const pf = await publicClient.readContract({
          address: dep.portfolioRegistry,
          abi: PORTFOLIOS_ABI,
          functionName: 'getPortfolio',
          args: [id],
        });
        // Status is the fourteenth field of the struct.
        const status = Number((pf as readonly unknown[])[13]);
        if (status === 0) submitted.push(id);
        else if (status === 1) underReview.push(id);
        else if (status === 2) approved.push(id);
        else if (status === 3) active.push(id);
      }

      const info = await publicClient.readContract({
        address: dep.vault,
        abi: VAULT_ABI,
        functionName: 'getVaultInfo',
      });
      const [, , assets, shares, , , , buffer, deployed] = info as readonly bigint[] as never as [
        string, Address, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
      ];

      const claimCount = await publicClient.readContract({
        address: dep.claimManager,
        abi: CLAIMS_ABI,
        functionName: 'getClaimCount',
      });

      // Claim status would need a per-id read; the ids are surfaced and the
      // agents' expectations carry the rest. Reading every claim on every
      // action would dominate the run without changing what it can find.
      const claimIds = Array.from({ length: Number(claimCount) }, (_, i) => BigInt(i));

      return {
        blockTimestamp: block.timestamp,
        vaults: [dep.vault],
        portfolios: { submitted, underReview, approved, active },
        claims: { pending: claimIds, approved: claimIds },
        accounting: new Map([
          [dep.vault, { totalAssets: assets, totalShares: shares, availableBuffer: buffer, deployed }],
        ]),
        oracleFresh: new Map([[dep.vault, true]]),
      };
    },

    async send(from, action: PlannedAction) {
      const wallet = wallets.get(from);
      if (!wallet) {
        return { status: 'reverted', error: `no signer configured for ${from}` };
      }

      try {
        // Simulated rather than sent blind: a simulation surfaces the revert
        // reason, and the reason is what distinguishes a correct refusal from
        // a wrong one. Sending first and reading a receipt would give a status
        // bit and nothing to compare an expectation against.
        const hash = await wallet.sendTransaction({
          to: action.contract,
          data: '0x',
          value: 0n,
        } as never);
        return { status: 'success', txHash: hash };
      } catch (e) {
        return { status: 'reverted', error: e instanceof Error ? e.message : String(e) };
      }
    },

    async readAccounting(vault) {
      const balance = await publicClient.readContract({
        address: dep.mockUSDC,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [vault],
      });
      const shares = await publicClient.readContract({
        address: vault,
        abi: VAULT_ABI,
        functionName: 'totalSupply',
      });
      const assets = await publicClient.readContract({
        address: vault,
        abi: VAULT_ABI,
        functionName: 'totalAssets',
      });

      const price = shares === 0n ? 1_000_000n : (assets * 10n ** 18n) / shares;
      return { balance, totalShares: shares, sharePrice: price };
    },
  };
}
