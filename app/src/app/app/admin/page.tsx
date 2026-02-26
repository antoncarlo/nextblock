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
import { INSURANCE_COMPANY_WHITELIST, CURATOR_WHITELIST } from '@/app/app/apply/page';

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
          Admin / Syndicate Manager Panel
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

      {/* Whitelist Management */}
      <div className="mt-6">
        <div style={{ background: '#FFFFFF', border: '1px solid rgba(27,58,107,0.12)', borderRadius: '16px', padding: '28px' }}>
          <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1B3A6B', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid rgba(27,58,107,0.08)' }}>
            Whitelist Management
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#166534' }} />
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 600, color: '#166534', margin: 0 }}>Insurance Company Admins ({INSURANCE_COMPANY_WHITELIST.length})</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {INSURANCE_COMPANY_WHITELIST.map((addr) => (
                  <div key={addr} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(22,101,52,0.05)', border: '1px solid rgba(22,101,52,0.15)', borderRadius: '8px', padding: '10px 14px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#166534' }}>{addr.slice(0, 10)}...{addr.slice(-6)}</span>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '10px', fontWeight: 600, background: 'rgba(22,101,52,0.1)', color: '#166534', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Approved</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#C9A84C' }} />
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 600, color: '#92400E', margin: 0 }}>Vault Syndicates ({CURATOR_WHITELIST.length})</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {CURATOR_WHITELIST.map((addr) => (
                  <div key={addr} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: '8px', padding: '10px 14px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#92400E' }}>{addr.slice(0, 10)}...{addr.slice(-6)}</span>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '10px', fontWeight: 600, background: 'rgba(201,168,76,0.12)', color: '#92400E', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Syndicate Manager</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#9A9A9A', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            To add addresses, update the whitelist arrays in <code style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: '3px' }}>src/app/app/apply/page.tsx</code>.
          </p>
        </div>
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
