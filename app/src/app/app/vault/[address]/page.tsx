"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId } from "wagmi";
import {
  useVaultInfo,
  useUserShares,
  useMaxWithdraw,
  usePendingClaims,
} from "@/hooks/useVaultData";
import { useVaultPolicies } from "@/hooks/useVaultPolicies";
import { useCurrentTime } from "@/hooks/usePolicyRegistry";
import { PolicyRow } from "@/components/vault/PolicyRow";
import { AllocationBar } from "@/components/vault/AllocationBar";
import { BufferVisualization } from "@/components/vault/BufferVisualization";
import { YieldTicker } from "@/components/vault/YieldTicker";
import { DepositSidebar } from "@/components/deposit/DepositSidebar";
import { VerificationBadge } from "@/components/shared/VerificationBadge";
import { useEnsName } from "@/hooks/useEns";
import {
  formatUSDC,
  formatFeeBps,
  formatBufferRatio,
  shortenAddress,
  getSharePriceNumber,
} from "@/lib/formatting";

// Static display metadata for all 8 vault curators
const VAULT_DISPLAY: Record<
  string,
  {
    manager: string;
    strategy: string;
    riskLevel: string;
    targetApy: string;
  }
> = {
  "Balanced Core": {
    manager: "NextBlock Core Team",
    strategy: "Full-spectrum insurance diversification, steady yield",
    riskLevel: "Moderate",
    targetApy: "8-12%",
  },
  "Digital Asset Shield": {
    manager: "AlphaRe Capital",
    strategy: "Automated on-chain claims only, pure crypto risk exposure",
    riskLevel: "Higher",
    targetApy: "10-14%",
  },
  "Parametric Shield": {
    manager: "StormGuard Capital",
    strategy: "Oracle-verified parametric insurance only",
    riskLevel: "Moderate",
    targetApy: "9-13%",
  },
  "Conservative Yield": {
    manager: "Klapton Re Partners",
    strategy: "Low-volatility off-chain reinsurance portfolio",
    riskLevel: "Lower",
    targetApy: "5-8%",
  },
  "Catastrophe & Specialty": {
    manager: "Alpine Re",
    strategy: "Catastrophe-focused with specialty lines diversification",
    riskLevel: "High",
    targetApy: "14-18%",
  },
  "Traditional Lines": {
    manager: "BondSecure Capital",
    strategy: "Established commercial and liability reinsurance",
    riskLevel: "Lower",
    targetApy: "6-9%",
  },
  "Technology & Specialty": {
    manager: "CyberGuard Partners",
    strategy: "Digital asset and technology risk with property diversification",
    riskLevel: "Moderate",
    targetApy: "8-11%",
  },
  "Multi-Line Diversified": {
    manager: "Meridian Risk Mgmt",
    strategy: "Maximum diversification across all categories",
    riskLevel: "Moderate",
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
    targetApy: "8-14%",
  };
}

const EXPLORER_URLS: Record<number, string> = {
  84532: "https://sepolia.basescan.org",
  8453: "https://basescan.org",
  11155111: "https://sepolia.etherscan.io",
  5042002: "https://testnet.arcscan.app",
};

function getExplorerUrl(chainId: number, address: string): string | null {
  const base = EXPLORER_URLS[chainId];
  if (!base) return null;
  return `${base}/address/${address}`;
}

type Tab = "overview" | "risk";

export default function VaultDetailPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const resolvedParams = use(params);
  const vaultAddress = resolvedParams.address as `0x${string}`;
  const { address: userAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const [tab, setTab] = useState<Tab>("overview");

  const { data: vaultInfo, isLoading: vaultLoading } =
    useVaultInfo(vaultAddress);
  const { policies, isLoading: policiesLoading } =
    useVaultPolicies(vaultAddress);
  const { data: currentTime } = useCurrentTime();
  const { data: userShares } = useUserShares(vaultAddress, userAddress);
  const { data: maxWithdraw } = useMaxWithdraw(vaultAddress, userAddress);
  const { data: pendingClaimsData } = usePendingClaims(vaultAddress);

  // Extract manager address for ENS resolution (must call hook before early returns)
  const managerAddr = vaultInfo
    ? ((vaultInfo as unknown as [string, `0x${string}`])[1])
    : undefined;
  const { ensName: managerEns } = useEnsName(managerAddr);

  if (vaultLoading) {
    return <VaultDetailSkeleton />;
  }

  if (!vaultInfo) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-gray-900">
            Vault not found
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Could not load vault at address {shortenAddress(vaultAddress)}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Back to vaults
          </Link>
        </div>
      </div>
    );
  }

  const [
    name,
    manager,
    assets,
    shares,
    ,
    bufferBps,
    feeBps,
    availableBuffer,
    deployedCapital,
    policyCount,
  ] = vaultInfo as unknown as [
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
  const sharePrice = getSharePriceNumber(assets, shares);
  const hasPosition = userShares !== undefined && userShares > 0n;
  const userValue =
    hasPosition && userShares ? (Number(userShares) * sharePrice) / 1e18 : 0;

  const pendingClaims = pendingClaimsData ?? 0n;

  // Cap max withdrawal at TVL-based free capital (totalAssets - deployed - pending).
  // The contract's maxWithdraw uses gross USDC buffer which includes unearned premiums,
  // but the buffer reserve should be a % of TVL, not gross balance.
  const freeCapital = assets > deployedCapital + pendingClaims
    ? assets - deployedCapital - pendingClaims
    : 0n;
  const effectiveMaxWithdraw = maxWithdraw !== undefined
    ? (freeCapital < maxWithdraw ? freeCapital : maxWithdraw)
    : undefined;

  const activeTabClass =
    "rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm";
  const inactiveTabClass =
    "rounded-md px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          Vaults
        </Link>
        <span className="mx-2 text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-900">{name}</span>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setTab("overview")}
          className={tab === "overview" ? activeTabClass : inactiveTabClass}
        >
          Overview
        </button>
        <button
          onClick={() => setTab("risk")}
          className={tab === "risk" ? activeTabClass : inactiveTabClass}
        >
          Risk
        </button>
      </div>

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column: vault details (2/3 width) */}
          <div className="space-y-6 lg:col-span-2">
            {/* Vault header */}
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                    {name}
                    {getExplorerUrl(chainId, vaultAddress) && (
                      <a
                        href={getExplorerUrl(chainId, vaultAddress)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View on block explorer"
                        className="text-gray-300 transition-colors hover:text-gray-500"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-5 w-5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Zm7.25-.75a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V6.31l-5.47 5.47a.75.75 0 1 1-1.06-1.06l5.47-5.47H12.25a.75.75 0 0 1-.75-.75Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </a>
                    )}
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Managed by{" "}
                    <span className="font-medium text-gray-700">
                      {managerEns || display.manager}
                    </span>
                    {managerEns && (
                      <span className="ml-1 text-xs text-gray-400">
                        ({shortenAddress(manager)})
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm italic text-gray-400">
                    &quot;{display.strategy}&quot;
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Target APY
                  </p>
                  <p className="font-mono-num text-2xl font-bold text-gray-900">
                    {display.targetApy}
                  </p>
                </div>
              </div>

              {/* Stats row */}
              <div className="mt-6 grid grid-cols-4 gap-4 border-t border-gray-100 pt-4">
                <div>
                  <p className="text-xs text-gray-400">TVL</p>
                  <p className="font-mono-num text-sm font-semibold text-gray-900">
                    {formatUSDC(assets)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Share Price</p>
                  <p className="font-mono-num text-sm font-semibold text-gray-900">
                    ${sharePrice.toFixed(4)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Mgmt Fee</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatFeeBps(feeBps)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Buffer Ratio</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatBufferRatio(bufferBps)}
                  </p>
                </div>
              </div>
            </div>

            {/* NAV Ticker */}
            <YieldTicker totalAssets={assets} totalSupply={shares} />

            {/* User position */}
            {isConnected && hasPosition && userShares && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <h3 className="mb-2 text-sm font-medium text-blue-800">
                  Your Position
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-blue-600">Shares</p>
                    <p className="font-mono-num text-sm font-semibold text-blue-900">
                      {(Number(userShares) / 1e18).toLocaleString("en-US", {
                        maximumFractionDigits: 6,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-600">Value</p>
                    <p className="font-mono-num text-sm font-semibold text-blue-900">
                      $
                      {userValue.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-600">Max Withdraw</p>
                    <p className="font-mono-num text-sm font-semibold text-blue-900">
                      {effectiveMaxWithdraw !== undefined
                        ? formatUSDC(effectiveMaxWithdraw)
                        : "--"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Allocation bar */}
            {policies.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <AllocationBar policies={policies} />
              </div>
            )}

            {/* Buffer visualization */}
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <BufferVisualization
                totalAssets={assets}
                deployedCapital={deployedCapital}
                pendingClaims={pendingClaims}
                bufferBps={bufferBps}
              />
            </div>

            {/* Policy table */}
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">
                  Policies ({Number(policyCount)})
                </h3>
              </div>

              {policiesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-28 animate-pulse rounded-lg bg-gray-50"
                    />
                  ))}
                </div>
              ) : policies.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">
                  No policies in this vault.
                </p>
              ) : (
                <div className="space-y-3">
                  {policies.map((policy) => (
                    <PolicyRow
                      key={Number(policy.policyId)}
                      policy={policy}
                      currentTime={currentTime ?? 0n}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column: deposit/withdraw sidebar (1/3 width) */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <DepositSidebar
              vaultAddress={vaultAddress}
              totalAssets={assets}
              totalSupply={shares}
              policyCount={Number(policyCount)}
              maxWithdrawOverride={effectiveMaxWithdraw}
            />
          </div>
        </div>
      ) : (
        /* Risk tab content */
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Risk Disclosures
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700">
                  Vault Manager
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {managerEns || display.manager} ({shortenAddress(manager)})
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700">
                  Verification Taxonomy
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  This vault uses three types of claim verification: On-chain
                  (trustless, permissionless via oracle price feeds),
                  Oracle-dependent (automated via third-party data feeds), and
                  Off-chain (insurer-assessed, manual verification). Each type
                  carries different trust assumptions and settlement guarantees.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700">
                  Buffer Ratio
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {formatBufferRatio(bufferBps)} of vault assets are held as
                  liquid buffer for immediate withdrawals. The remaining capital
                  is deployed as underwriting capacity. During high-claim
                  events, withdrawal capacity may be temporarily reduced.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700">
                  Smart Contract Risk
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  This vault is deployed on a testnet for demonstration
                  purposes. Smart contracts have not been audited. In
                  production, all contracts will undergo multiple security
                  audits and bug bounty programs. Never deposit funds you cannot
                  afford to lose.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VaultDetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 h-4 w-40 rounded bg-gray-200" />
      <div className="mb-6 h-10 w-48 rounded-lg bg-gray-100" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="h-48 animate-pulse rounded-xl border border-gray-200 bg-white" />
          <div className="h-24 animate-pulse rounded-xl border border-gray-200 bg-white" />
          <div className="h-32 animate-pulse rounded-xl border border-gray-200 bg-white" />
          <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white" />
        </div>
        <div className="h-80 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    </div>
  );
}
