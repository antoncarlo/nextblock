import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { CLAIM_MANAGER_ABI, PORTFOLIO_REGISTRY_ABI } from '@/config/contracts';
import { NEXTBLOCK_ADDRESSES } from '@/config/generated/addressBook';
import { unitsToDecimal } from '../braino/client.ts';
import type { ClaimContext } from './provider.ts';

/** A read-only client on the protocol's chain. */
export function createChainReader(
  rpcUrl: string = process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org',
) {
  return createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
}
export type ChainReader = ReturnType<typeof createChainReader>;

/**
 * Read what the chain knows about a claim, to give the AI provider the context spec
 * S3 asks for: the claim, the portfolio it belongs to and that portfolio's terms.
 *
 * Source of truth is the chain, never the audit-trail mirror: the mirror only tells
 * the cron which claims exist. A read failure throws, and the caller skips the claim
 * so the next tick retries it.
 */
export async function loadClaimContext(
  client: ChainReader,
  claimId: bigint,
): Promise<{ context: ClaimContext; requestedAmount: bigint }> {
  const claim = await client.readContract({
    address: NEXTBLOCK_ADDRESSES.claimManager as `0x${string}`,
    abi: CLAIM_MANAGER_ABI,
    functionName: 'getClaim',
    args: [claimId],
  });
  const portfolio = await client.readContract({
    address: NEXTBLOCK_ADDRESSES.portfolioRegistry as `0x${string}`,
    abi: PORTFOLIO_REGISTRY_ABI,
    functionName: 'getPortfolio',
    args: [claim.portfolioId],
  });

  return {
    requestedAmount: claim.requestedAmount,
    context: {
      portfolioId: claim.portfolioId,
      vault: claim.vault,
      claimType: Number(claim.claimType) === 1 ? 'PARAMETRIC' : 'NON_PARAMETRIC',
      evidenceHash: claim.evidenceHash,
      submittedAt: Number(claim.submittedAt),
      coverageLimit: portfolio.coverageLimit,
      policyTerms: {
        lineOfBusiness: portfolio.lineOfBusiness,
        jurisdiction: portfolio.jurisdiction,
        structureType: Number(portfolio.structureType),
        inceptionTime: Number(portfolio.inceptionTime),
        expiryTime: Number(portfolio.expiryTime),
        expectedLossBps: Number(portfolio.expectedLossBps),
        cededPremium: unitsToDecimal(portfolio.cededPremium),
        documentHash: portfolio.documentHash,
      },
    },
  };
}
