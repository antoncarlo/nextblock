'use client';

import { useAccount } from 'wagmi';
import { useVaultAddresses, useMultiVaultInfo } from '@/hooks/useVaultData';
import { LEGACY_ADMIN_UI_HINT } from '@/config/constants';
import { useProtocolAccess } from '@/hooks/useProtocolAccess';
import { TimeControls } from '@/components/admin/TimeControls';
import { LensProtocolStatus } from '@/components/admin/LensProtocolStatus';
import { KybReviewQueue } from '@/components/admin/KybReviewQueue';
import { RoleHandoffPanel } from '@/components/admin/RoleHandoffPanel';
import { WhitelistPanel } from '@/components/admin/WhitelistPanel';
import { OracleControls } from '@/components/admin/OracleControls';
import { ClaimTriggers } from '@/components/admin/ClaimTriggers';
import { ClaimReceipts } from '@/components/admin/ClaimReceipts';
import { ClaimLifecyclePanel } from '@/components/claims/ClaimLifecyclePanel';
import { PolicyPool } from '@/components/admin/PolicyPool';
import { DemoControls } from '@/components/admin/DemoControls';
import { useEmailSession } from '@/hooks/useEmailSession';

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const emailSession = useEmailSession();

  // PRIMARY gate: on-chain protocol roles read from ProtocolRoles (canonical
  // RBAC). The legacy hint list is a UI-only fallback for demo wallets and is
  // explicitly NOT a security boundary: every privileged action behind this
  // page is enforced on-chain (role-gated contracts) or server-side (signed
  // KYB APIs), never by this client-side check.
  const access = useProtocolAccess();
  const hasOnchainAdminRole =
    access.status === 'onchain' && (access.isOwner || access.isSentinel || access.isCommittee);
  const isLegacyHintWallet =
    isConnected &&
    !!address &&
    LEGACY_ADMIN_UI_HINT.map((a) => a.toLowerCase()).includes(address.toLowerCase());
  const isEmailAdmin = emailSession.isEmailAuthenticated && emailSession.isAppAdmin;
  const isAdmin = hasOnchainAdminRole || isLegacyHintWallet || isEmailAdmin;

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

  if (!isConnected && !isEmailAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="mt-2 text-sm text-gray-500">
            Connect an authorized wallet or sign in with an authorized admin email to access admin controls.
          </p>
          {emailSession.error && (
            <p className="mt-2 text-xs text-red-600">Email session: {emailSession.error}</p>
          )}
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
            This dashboard renders only for wallets holding an on-chain protocol
            role (Owner, Sentinel or Claims Committee on ProtocolRoles) or for
            email sessions with the application admin role.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Connected wallet: {address ?? 'none'} · Email admin: {isEmailAdmin ? emailSession.profile?.user.email : 'none'}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Note: this is a UI gate only. Real authorization is enforced
            on-chain and by the server-side signed APIs.
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
        <p className="mt-1 text-xs text-gray-400">
          This page is a UI surface, not a security boundary: every privileged
          action is authorized on-chain (ProtocolRoles) or server-side (signed
          wallet APIs or verified email RBAC). Email access can operate off-chain
          admin/KYB workflows, while on-chain writes still require a wallet signature.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-6">
          <LensProtocolStatus />
          <KybReviewQueue />
          <RoleHandoffPanel />
          <WhitelistPanel />
          <TimeControls />
          <OracleControls />
          <DemoControls />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <ClaimLifecyclePanel />
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

      {/* Role Management (on-chain) */}
      <div className="mt-6">
        <div style={{ background: '#FFFFFF', border: '1px solid rgba(27,58,107,0.12)', borderRadius: '16px', padding: '28px' }}>
          <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1B3A6B', marginBottom: '12px' }}>
            Role &amp; Compliance Management — On-chain
          </h3>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#5A5A5A', lineHeight: 1.7, margin: 0 }}>
            Phase 9: frontend whitelists were removed. Authorization is managed exclusively
            on-chain via <code style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: '3px' }}>ProtocolRoles</code> (Underwriting
            Curator, Cedant/Reinsurer, Claims Committee, Sentinel, Allocator, Oracle, KYC Operator)
            and <code style={{ background: '#F3F4F6', padding: '1px 4px', borderRadius: '3px' }}>ComplianceRegistry</code> (LP
            whitelist, KYC expiry, jurisdiction, block flags). Grant or revoke roles with the
            protocol owner wallet through the contracts; this dashboard reflects on-chain state only.
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
                const [vaultName, , assets, , sharePrice, , feeBps, availableBuffer, deployedCapital, policyCount] = result;

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
