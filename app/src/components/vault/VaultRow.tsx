"use client";

import Link from "next/link";
import { useVaultInfo } from "@/hooks/useVaultData";
import {
  useVaultPolicyIds,
  useGlobalPoliciesData,
} from "@/hooks/useVaultPolicies";
import { useEnsName } from "@/hooks/useEns";
import { VerificationDot } from "@/components/shared/VerificationBadge";
import {
  formatUSDCCompact,
  getSharePriceNumber,
  shortenAddress,
} from "@/lib/formatting";

// Vault display metadata (name substring -> display info)
const VAULT_DISPLAY: Record<
  string,
  {
    manager: string;
    strategy: string;
    riskLevel: string;
    riskColor: string;
    targetApy: string;
  }
> = {
  "Balanced Core": {
    manager: "NextBlock Core Team",
    strategy: "Full-spectrum diversification across all verification types",
    riskLevel: "Moderate",
    riskColor: "text-amber-600 bg-amber-50",
    targetApy: "8-12%",
  },
  "Digital Asset Shield": {
    manager: "AlphaRe Capital",
    strategy: "Automated on-chain claims only, pure crypto risk exposure",
    riskLevel: "Higher",
    riskColor: "text-orange-600 bg-orange-50",
    targetApy: "10-14%",
  },
  "Parametric Shield": {
    manager: "StormGuard Capital",
    strategy: "Oracle-verified parametric insurance only",
    riskLevel: "Moderate",
    riskColor: "text-amber-600 bg-amber-50",
    targetApy: "9-13%",
  },
  "Conservative Yield": {
    manager: "Klapton Re Partners",
    strategy: "Low-volatility off-chain reinsurance portfolio",
    riskLevel: "Lower",
    riskColor: "text-emerald-600 bg-emerald-50",
    targetApy: "5-8%",
  },
  "Catastrophe & Specialty": {
    manager: "Alpine Re",
    strategy: "Catastrophe-focused with specialty lines diversification",
    riskLevel: "High",
    riskColor: "text-red-600 bg-red-50",
    targetApy: "14-18%",
  },
  "Traditional Lines": {
    manager: "BondSecure Capital",
    strategy: "Established commercial and liability reinsurance",
    riskLevel: "Lower",
    riskColor: "text-emerald-600 bg-emerald-50",
    targetApy: "6-9%",
  },
  "Technology & Specialty": {
    manager: "CyberGuard Partners",
    strategy: "Digital asset and technology risk with property diversification",
    riskLevel: "Moderate",
    riskColor: "text-amber-600 bg-amber-50",
    targetApy: "8-11%",
  },
  "Multi-Line Diversified": {
    manager: "Meridian Risk Mgmt",
    strategy: "Maximum diversification across all categories",
    riskLevel: "Moderate",
    riskColor: "text-amber-600 bg-amber-50",
    targetApy: "9-13%",
  },
};

function getVaultDisplay(name: string) {
  for (const [key, value] of Object.entries(VAULT_DISPLAY)) {
    if (name.includes(key)) return value;
  }
  return {
    manager: "Vault Manager",
    strategy: "Custom strategy",
    riskLevel: "Moderate",
    riskColor: "text-amber-600 bg-amber-50",
    targetApy: "8-14%",
  };
}

interface VaultRowProps {
  vaultAddress: `0x${string}`;
}

export function VaultRow({ vaultAddress }: VaultRowProps) {
  const { data: vaultInfo, isLoading, error } = useVaultInfo(vaultAddress);
  const { data: policyIds } = useVaultPolicyIds(vaultAddress);
  const { data: globalPolicies } = useGlobalPoliciesData(policyIds);

  // Extract manager address for ENS resolution (must call hook before early returns)
  const managerAddr = vaultInfo
    ? ((vaultInfo as unknown as [string, `0x${string}`])[1])
    : undefined;
  const { ensName } = useEnsName(managerAddr);

  if (isLoading) {
    return <VaultRowSkeleton />;
  }

  if (error || !vaultInfo) {
    return (
      <tr className="border-b border-gray-50">
        <td className="px-6 py-4" colSpan={6}>
          <div className="flex items-center gap-2">
            <span className="text-sm text-red-600">
              Failed to load vault {shortenAddress(vaultAddress)}
            </span>
          </div>
        </td>
      </tr>
    );
  }

  const [name, , assets, , , , , , , policyCount] = vaultInfo as unknown as [
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

  const display = getVaultDisplay(name);
  const managerDisplay = ensName || display.manager;

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
    <tr className="group cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50">
      <td className="px-6 py-4">
        <Link href={`/vault/${vaultAddress}`} className="block">
          <div className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
            {name}
          </div>
          <div className="mt-0.5 text-xs text-gray-400">{managerDisplay}</div>
        </Link>
      </td>
      <td className="px-6 py-4">
        <Link href={`/vault/${vaultAddress}`} className="block">
          <span className="font-mono text-sm font-medium text-gray-900">
            {formatUSDCCompact(assets)}
          </span>
        </Link>
      </td>
      <td className="px-6 py-4">
        <Link href={`/vault/${vaultAddress}`} className="block">
          <span className="text-sm text-gray-600">{ensName || shortenAddress(managerAddr!)}</span>
        </Link>
      </td>
      <td className="px-6 py-4">
        <Link href={`/vault/${vaultAddress}`} className="block">
          <div className="flex items-center gap-1.5">
            {Array.from(verificationTypes)
              .sort()
              .map((vt) => (
                <VerificationDot key={vt} type={vt} />
              ))}
            {verificationTypes.size === 0 && (
              <span className="text-xs text-gray-300">--</span>
            )}
          </div>
        </Link>
      </td>
      <td className="px-6 py-4 text-center">
        <Link href={`/vault/${vaultAddress}`} className="block">
          <span className="text-sm font-medium text-gray-700">
            {Number(policyCount)}
          </span>
        </Link>
      </td>
      <td className="px-6 py-4 text-right">
        <Link href={`/vault/${vaultAddress}`} className="block">
          <span className="text-sm font-semibold text-gray-900">
            {display.targetApy}
          </span>
        </Link>
      </td>
    </tr>
  );
}

function VaultRowSkeleton() {
  return (
    <tr className="border-b border-gray-50">
      <td className="px-6 py-4">
        <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
        <div className="mt-1.5 h-3 w-20 animate-pulse rounded bg-gray-100" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
      </td>
      <td className="px-6 py-4">
        <div className="flex gap-1.5">
          <div className="h-2 w-2 animate-pulse rounded-full bg-gray-200" />
          <div className="h-2 w-2 animate-pulse rounded-full bg-gray-200" />
        </div>
      </td>
      <td className="px-6 py-4 text-center">
        <div className="mx-auto h-4 w-6 animate-pulse rounded bg-gray-200" />
      </td>
      <td className="px-6 py-4 text-right">
        <div className="ml-auto h-4 w-14 animate-pulse rounded bg-gray-200" />
      </td>
    </tr>
  );
}
