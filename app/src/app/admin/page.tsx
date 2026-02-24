'use client';

import { useAccount } from 'wagmi';
import { useVaultAddresses, useMultiVaultInfo } from '@/hooks/useVaultData';
import { useAdminAddress } from '@/hooks/useAdminAddress';
import { TimeControls } from '@/components/admin/TimeControls';
import { OracleControls } from '@/components/admin/OracleControls';
import { ClaimTriggers } from '@/components/admin/ClaimTriggers';
import { ClaimReceipts } from '@/components/admin/ClaimReceipts';
import { PolicyPool } from '@/components/admin/PolicyPool';
import { DemoControls } from '@/components/admin/DemoControls';

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const adminAddress = useAdminAddress();
  const isAdmin =
    isConnected &&
    address?.toLowerCase() === adminAddress.toLowerCase();

  const { data: vaultAddresses } = useVaultAddresses();
  const { data: vaultInfos } = useMultiVaultInfo(vaultAddresses);

  // Build vault names list
  const vaultNames: string[] = [];
  if (vaultInfos) {
    for (const info of vaultInfos) {
      if (info.status === 'success' && info.result) {
        const result = info.result as unknown as [string, ...unknown[]];
        vaultNames.push(result[0]);
      } else {
        vaultNames.push('Unknown Vault');
      }
    }
  }

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="mt-2 text-sm text-gray-500">
            Connect your wallet to access admin controls.
          </p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
          <p className="mt-2 text-sm text-gray-500">
            This page is only accessible to the admin wallet.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Connected: {address}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Required: {adminAddress}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Admin / Curator Panel
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Control time, oracles, and claim triggers for the demo. All changes
          affect both vaults.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-6">
          <TimeControls />
          <OracleControls />
          <DemoControls />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <ClaimTriggers
            vaultAddresses={vaultAddresses ?? []}
            vaultNames={vaultNames}
          />
          <ClaimReceipts />
        </div>
      </div>

      {/* Full-width section: Policy Pool */}
      <div className="mt-6">
        <PolicyPool />
      </div>

      {/* Vault overview (compact) */}
      {vaultAddresses && vaultInfos && (
        <div className="mt-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">
              Vault Overview
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {vaultAddresses.map((addr, idx) => {
                const info = vaultInfos[idx];
                if (info.status !== 'success' || !info.result) return null;
                const result = info.result as unknown as [string, `0x${string}`, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
                const [vaultName, , assets, totalShares, sharePrice, bufferBps, feeBps, availableBuffer, deployedCapital, policyCount] = result;

                const sharePriceNum = Number(sharePrice) / 1e6;

                return (
                  <div
                    key={addr}
                    className="rounded-lg border border-gray-100 p-4"
                  >
                    <h4 className="mb-2 text-sm font-medium text-gray-900">
                      {vaultName}
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-gray-400">TVL</span>
                        <p className="font-mono-num font-medium text-gray-900">
                          ${(Number(assets) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">Share Price</span>
                        <p className="font-mono-num font-medium text-gray-900">
                          ${sharePriceNum.toFixed(4)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">Policies</span>
                        <p className="font-medium text-gray-900">
                          {Number(policyCount)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">Buffer</span>
                        <p className="font-mono-num font-medium text-gray-900">
                          ${(Number(availableBuffer) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">Deployed</span>
                        <p className="font-mono-num font-medium text-gray-900">
                          ${(Number(deployedCapital) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">Fee</span>
                        <p className="font-medium text-gray-900">
                          {(Number(feeBps) / 100).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      {addr.slice(0, 10)}...{addr.slice(-6)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
