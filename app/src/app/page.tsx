"use client";

import { useVaultAddresses } from "@/hooks/useVaultData";
import { VaultTable } from "@/components/vault/VaultTable";
import { VerificationBadge } from "@/components/shared/VerificationBadge";
import { VerificationType } from "@/config/constants";

export default function VaultDiscoveryPage() {
  const { data: vaultAddresses, isLoading, error } = useVaultAddresses();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Earn on your terms
        </h1>
        <p className="mt-2 max-w-2xl text-base text-gray-600">
          Insurance-backed yield from independent curators. Pick a vault,
          deposit capital, and earn premiums as yield while your funds provide
          underwriting capacity.
        </p>
      </div>

      {/* Platform info */}
      <div className="mt-8 mb-8 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">How It Works</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          <div>
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <span className="text-sm font-bold text-slate-600">1</span>
            </div>
            <h3 className="text-sm font-medium text-gray-900">
              Tokenized Policies
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Insurance policies are tokenized on-chain with transparent terms,
              coverage, and verification methods.
            </p>
          </div>
          <div>
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <span className="text-sm font-bold text-slate-600">2</span>
            </div>
            <h3 className="text-sm font-medium text-gray-900">
              Curated Vaults
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Vault managers build diversified portfolios from tokenized
              policies. Different strategies for different risk appetites.
            </p>
          </div>
          <div>
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <span className="text-sm font-bold text-slate-600">3</span>
            </div>
            <h3 className="text-sm font-medium text-gray-900">Earn Premiums</h3>
            <p className="mt-1 text-xs text-gray-500">
              Your deposit provides underwriting capacity. Premiums accrue as
              yield over time. Withdraw anytime from the liquidity buffer.
            </p>
          </div>
        </div>
      </div>

      {/* Verification legend */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
          Insurance verification types:
        </span>
        <VerificationBadge type={VerificationType.ON_CHAIN} />
        <VerificationBadge type={VerificationType.ORACLE_DEPENDENT} />
        <VerificationBadge type={VerificationType.OFF_CHAIN} />
      </div>

      {/* Vault table */}
      {isLoading ? (
        <VaultTableSkeleton />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-800">
            Failed to load vaults
          </p>
          <p className="mt-1 text-xs text-red-600">
            Make sure contracts are deployed and addresses are configured.
          </p>
        </div>
      ) : !vaultAddresses || vaultAddresses.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <svg
              className="h-6 w-6 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-gray-900">No vaults found</h3>
          <p className="mt-1 text-xs text-gray-500">
            Deploy contracts and run the setup script to create vaults.
          </p>
        </div>
      ) : (
        <VaultTable vaultAddresses={vaultAddresses} />
      )}
    </div>
  );
}

function VaultTableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
            <th className="px-6 py-3">Vault</th>
            <th className="px-6 py-3">TVL</th>
            <th className="px-6 py-3">Curator</th>
            <th className="px-6 py-3">Exposure</th>
            <th className="px-6 py-3 text-center">Policies</th>
            <th className="px-6 py-3 text-right">Target APY</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i} className="border-b border-gray-50">
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
