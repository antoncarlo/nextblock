"use client";

import Link from "next/link";
import { useVaultInfo, useUserShares } from "@/hooks/useVaultData";
import { useVaultPolicyIds } from "@/hooks/useVaultPolicies";
import { useGlobalPoliciesData } from "@/hooks/useVaultPolicies";
import { useAccount } from "wagmi";
import { VerificationDot } from "@/components/shared/VerificationBadge";
import { useOfferingTerms } from "@/hooks/useOfferingTerms";
import { resolveVaultDisplay } from "@/config/vaultDisplay";
import {
  formatUSDCCompact,
  getSharePriceNumber,
  formatFeeBps,
  formatBufferRatio,
  shortenAddress,
} from "@/lib/formatting";

// Display metadata comes from @/config/vaultDisplay, the same source the market
// table reads. This file used to carry its own copy of the table — two hardcoded
// sets of numbers for the same vaults, already drifted: the local copy still
// keyed off "DeFi Alpha", a vault name that no longer exists. Worse, it never
// consulted the published offering terms, so real terms entered by a curator
// would not have reached this card at all.

interface VaultCardProps {
  vaultAddress: `0x${string}`;
}

export function VaultCard({ vaultAddress }: VaultCardProps) {
  const { address: userAddress } = useAccount();
  const { data: vaultInfo, isLoading, error } = useVaultInfo(vaultAddress);
  const { data: policyIds } = useVaultPolicyIds(vaultAddress);
  const { data: globalPolicies } = useGlobalPoliciesData(policyIds);
  const { data: userShares } = useUserShares(vaultAddress, userAddress);
  const { terms } = useOfferingTerms();

  if (isLoading) {
    return <VaultCardSkeleton />;
  }

  if (error || !vaultInfo) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-red-800">
          Vault {shortenAddress(vaultAddress)}
        </h3>
        <p className="mt-1 text-xs text-red-600">
          {error
            ? (error as Error).message?.split("\n")[0] || "Contract call failed"
            : "No data returned"}
        </p>
      </div>
    );
  }

  const [name, , assets, shares, , bufferBps, feeBps, , , policyCount] =
    vaultInfo as unknown as [
      string,
      `0x${string}`,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
    ];

  const display = resolveVaultDisplay(name, terms.get(vaultAddress.toLowerCase()));
  const sharePrice = getSharePriceNumber(assets, shares);
  const hasPosition = userShares !== undefined && userShares > 0n;

  // Get unique verification types
  const verificationTypes: Set<number> = new Set();
  if (globalPolicies) {
    for (const gp of globalPolicies) {
      if (gp.status === "success" && gp.result) {
        const policy = gp.result as unknown as { verificationType: number };
        verificationTypes.add(policy.verificationType);
      }
    }
  }

  return (
    <Link href={`/app/vault/${vaultAddress}`}>
      <div className="group relative rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-gray-300 hover:shadow-md">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
            <p className="mt-0.5 text-sm text-gray-500">{display.manager}</p>
          </div>
          {/* The shared config carries the grade colour as a hex, not as Tailwind
              classes, so the tint is applied inline. */}
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ color: display.riskColor, background: `${display.riskColor}14` }}
          >
            {display.riskLevel}
          </span>
        </div>

        {/* Strategy */}
        <p className="mb-4 text-sm text-gray-600">{display.strategy}</p>

        {/* Key stats */}
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Illustrative APY
            </p>
            <p className="font-mono-num mt-0.5 text-xl font-semibold text-gray-900">
              {display.targetApy}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
              TVL
            </p>
            <p className="font-mono-num mt-0.5 text-xl font-semibold text-gray-900">
              {formatUSDCCompact(assets)}
            </p>
          </div>
        </div>

        {/* Details row */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <div className="flex items-center gap-4">
            <div className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">
                {Number(policyCount)}
              </span>{" "}
              {Number(policyCount) === 1 ? "policy" : "policies"}
            </div>
            <div className="text-xs text-gray-500">
              Fee:{" "}
              <span className="font-medium text-gray-700">
                {formatFeeBps(feeBps)}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              Buffer:{" "}
              <span className="font-medium text-gray-700">
                {formatBufferRatio(bufferBps)}
              </span>
            </div>
          </div>

          {/* Verification type dots */}
          <div className="flex items-center gap-1.5">
            {Array.from(verificationTypes)
              .sort()
              .map((vt) => (
                <VerificationDot key={vt} type={vt} />
              ))}
          </div>
        </div>

        {/* Share price */}
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
          <span className="text-xs text-gray-500">Share price</span>
          <span className="font-mono-num text-sm font-medium text-gray-900">
            ${sharePrice.toFixed(4)}
          </span>
        </div>

        {/* User position (if any) */}
        {hasPosition && userShares && (
          <div className="mt-3 rounded-lg bg-blue-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-blue-700">
                Your position
              </span>
              <span className="font-mono-num text-sm font-semibold text-blue-900">
                $
                {((Number(userShares) * sharePrice) / 1e18).toLocaleString(
                  "en-US",
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  },
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

function VaultCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="h-5 w-32 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-24 rounded bg-gray-100" />
        </div>
        <div className="h-5 w-16 rounded-full bg-gray-100" />
      </div>
      <div className="mb-4 h-4 w-48 rounded bg-gray-100" />
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <div className="h-3 w-16 rounded bg-gray-100" />
          <div className="mt-2 h-6 w-20 rounded bg-gray-200" />
        </div>
        <div>
          <div className="h-3 w-16 rounded bg-gray-100" />
          <div className="mt-2 h-6 w-20 rounded bg-gray-200" />
        </div>
      </div>
      <div className="border-t border-gray-100 pt-4">
        <div className="h-4 w-full rounded bg-gray-100" />
      </div>
    </div>
  );
}
