'use client';

import { useState } from 'react';
import { useCheckClaim, useReportEvent, useSubmitClaim } from '@/hooks/useClaimTrigger';
import { useVaultPolicies } from '@/hooks/useVaultPolicies';
import { VerificationBadge } from '@/components/shared/VerificationBadge';
import { VerificationType } from '@/config/constants';
import { formatUSDCCompact, parseUSDC } from '@/lib/formatting';

interface ClaimTriggersProps {
  vaultAddresses: readonly `0x${string}`[];
  vaultNames: string[];
}

export function ClaimTriggers({ vaultAddresses, vaultNames }: ClaimTriggersProps) {
  const [selectedVaultIdx, setSelectedVaultIdx] = useState(0);
  const selectedVault = vaultAddresses[selectedVaultIdx];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="mb-1 text-sm font-semibold text-gray-900">
        Claim Triggers
      </h3>
      <p className="mb-4 text-xs text-gray-500">
        Trigger claims on policies. Claims auto-settle when the vault has
        sufficient funds. Each verification type uses a different trigger path.
      </p>

      {/* Vault selector */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Target Vault
        </label>
        <select
          value={selectedVaultIdx}
          onChange={(e) => setSelectedVaultIdx(Number(e.target.value))}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
        >
          {vaultAddresses.map((_, idx) => (
            <option key={idx} value={idx}>
              {vaultNames[idx] || `Vault ${idx + 1}`}
            </option>
          ))}
        </select>
      </div>

      {/* Dynamic policy triggers */}
      {selectedVault && (
        <VaultPolicyTriggers vaultAddress={selectedVault} />
      )}
    </div>
  );
}

function VaultPolicyTriggers({ vaultAddress }: { vaultAddress: `0x${string}` }) {
  const { policies, isLoading } = useVaultPolicies(vaultAddress);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-50" />
        ))}
      </div>
    );
  }

  if (policies.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-gray-400">
        No policies in this vault.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {policies.map((policy) => (
        <PolicyTriggerRow
          key={Number(policy.policyId)}
          vaultAddress={vaultAddress}
          policyId={policy.policyId}
          name={policy.global.name}
          verificationType={policy.global.verificationType}
          coverageAmount={policy.global.coverageAmount}
          claimed={policy.vault.claimed}
        />
      ))}
    </div>
  );
}

function PolicyTriggerRow({
  vaultAddress,
  policyId,
  name,
  verificationType,
  coverageAmount,
  claimed,
}: {
  vaultAddress: `0x${string}`;
  policyId: bigint;
  name: string;
  verificationType: number;
  coverageAmount: bigint;
  claimed: boolean;
}) {
  const [claimAmount, setClaimAmount] = useState('');
  const checkClaim = useCheckClaim();
  const reportEvent = useReportEvent();
  const submitClaim = useSubmitClaim();

  const coverageStr = formatUSDCCompact(coverageAmount);

  if (claimed) {
    return (
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 opacity-60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500 line-through">{name}</span>
            <VerificationBadge type={verificationType} />
          </div>
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
            Claimed
          </span>
        </div>
      </div>
    );
  }

  if (verificationType === VerificationType.ON_CHAIN) {
    return (
      <div className="rounded-lg border border-gray-100 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{name}</span>
            <VerificationBadge type={verificationType} />
          </div>
          <span className="text-xs text-gray-400">{coverageStr}</span>
        </div>
        <p className="mb-2 text-xs text-gray-500">
          Permissionless. Anyone can trigger if oracle condition is met.
        </p>
        <button
          type="button"
          onClick={() => checkClaim.trigger(vaultAddress, policyId)}
          disabled={checkClaim.isPending}
          className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
        >
          {checkClaim.isPending ? 'Triggering...' : 'Check & Settle'}
        </button>
        {checkClaim.isSuccess && (
          <p className="mt-2 text-xs text-emerald-600">Claim triggered and auto-settled.</p>
        )}
        {checkClaim.error && (
          <p className="mt-2 text-xs text-red-600">
            {(checkClaim.error as Error).message?.split('\n')[0] || 'Transaction failed'}
          </p>
        )}
      </div>
    );
  }

  if (verificationType === VerificationType.ORACLE_DEPENDENT) {
    return (
      <div className="rounded-lg border border-gray-100 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{name}</span>
            <VerificationBadge type={verificationType} />
          </div>
          <span className="text-xs text-gray-400">{coverageStr}</span>
        </div>
        <p className="mb-2 text-xs text-gray-500">
          Oracle reporter only. Set oracle condition first, then trigger.
        </p>
        <button
          type="button"
          onClick={() => reportEvent.trigger(vaultAddress, policyId)}
          disabled={reportEvent.isPending}
          className="w-full rounded-lg border border-amber-200 px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50"
        >
          {reportEvent.isPending ? 'Triggering...' : 'Report Event & Settle'}
        </button>
        {reportEvent.isSuccess && (
          <p className="mt-2 text-xs text-emerald-600">Claim triggered and auto-settled.</p>
        )}
        {reportEvent.error && (
          <p className="mt-2 text-xs text-red-600">
            {(reportEvent.error as Error).message?.split('\n')[0] || 'Transaction failed'}
          </p>
        )}
      </div>
    );
  }

  // OFF_CHAIN
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{name}</span>
          <VerificationBadge type={verificationType} />
        </div>
        <span className="text-xs text-gray-400">{coverageStr}</span>
      </div>
      <p className="mb-2 text-xs text-gray-500">
        Insurer admin only. Specify claim amount (up to {coverageStr} coverage).
      </p>
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Claim amount (USDC)"
          value={claimAmount}
          onChange={(e) => setClaimAmount(e.target.value)}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:border-gray-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            const amount = parseUSDC(claimAmount);
            if (amount > 0n) {
              submitClaim.trigger(vaultAddress, policyId, amount);
              setClaimAmount('');
            }
          }}
          disabled={submitClaim.isPending || !claimAmount}
          className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {submitClaim.isPending ? '...' : 'Submit'}
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setClaimAmount(String(Number(coverageAmount) / 2e6))}
          className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          50% ({formatUSDCCompact(coverageAmount / 2n)})
        </button>
        <button
          type="button"
          onClick={() => setClaimAmount(String(Number(coverageAmount) / 1e6))}
          className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          Full ({coverageStr})
        </button>
      </div>
      {submitClaim.isSuccess && (
        <p className="mt-2 text-xs text-emerald-600">Claim submitted and auto-settled.</p>
      )}
      {submitClaim.error && (
        <p className="mt-2 text-xs text-red-600">
          {(submitClaim.error as Error).message?.split('\n')[0] || 'Transaction failed'}
        </p>
      )}
    </div>
  );
}
