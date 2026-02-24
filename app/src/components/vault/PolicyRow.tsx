'use client';

import type { CombinedPolicyData } from '@/hooks/useVaultPolicies';
import { VerificationBadge } from '@/components/shared/VerificationBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import {
  formatUSDC,
  formatDaysRemaining,
  formatDuration,
  formatAllocationWeight,
  calculatePolicyProgress,
} from '@/lib/formatting';

interface PolicyRowProps {
  policy: CombinedPolicyData;
  currentTime: bigint;
}

/** Human-readable policy name fallback */
const POLICY_NAMES: Record<number, string> = {
  1: 'BTC Price Protection',
  2: 'Flight Delay',
  3: 'Commercial Fire',
};

export function PolicyRow({ policy, currentTime }: PolicyRowProps) {
  const { global, vault, policyId } = policy;
  const policyName = global.name || POLICY_NAMES[Number(policyId)] || `Policy #${policyId}`;
  const endTime = vault.startTime + vault.duration;
  const progress = calculatePolicyProgress(vault.startTime, vault.duration, currentTime);

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 transition-colors hover:border-gray-200">
      {/* Top row: name, badge, status */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-gray-900">{policyName}</h4>
          <VerificationBadge type={global.verificationType} />
        </div>
        <StatusBadge
          status={global.status}
          claimed={vault.claimed}
          expired={vault.expired}
        />
      </div>

      {/* Stats grid */}
      <div className="mb-3 grid grid-cols-4 gap-3">
        <div>
          <p className="text-xs text-gray-400">Coverage</p>
          <p className="font-mono-num text-sm font-medium text-gray-900">
            {formatUSDC(vault.coverage)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Premium</p>
          <p className="font-mono-num text-sm font-medium text-gray-900">
            {formatUSDC(vault.premium)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Allocation</p>
          <p className="font-mono-num text-sm font-medium text-gray-900">
            {formatAllocationWeight(vault.allocationWeight)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Duration</p>
          <p className="text-sm font-medium text-gray-900">
            {formatDuration(vault.duration)}
          </p>
        </div>
      </div>

      {/* Progress bar (time remaining) */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {vault.claimed
              ? 'Claimed'
              : vault.expired
                ? 'Expired'
                : formatDaysRemaining(endTime, currentTime) + ' remaining'}
          </span>
          <span className="font-mono-num text-xs text-gray-400">
            Earned: {formatUSDC(vault.earnedPremium)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              vault.claimed
                ? 'bg-red-400'
                : vault.expired
                  ? 'bg-gray-300'
                  : 'bg-emerald-400'
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
