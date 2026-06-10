'use client';

import type { CombinedPolicyData } from '@/hooks/useVaultPolicies';
import { VerificationType, VERIFICATION_CONFIG } from '@/config/constants';
import { formatAllocationWeight } from '@/lib/formatting';

interface AllocationBarProps {
  policies: CombinedPolicyData[];
}

const POLICY_NAMES: Record<number, string> = {
  1: 'BTC Protection',
  2: 'Flight Delay',
  3: 'Commercial Fire',
};

const SEGMENT_COLORS: Record<number, string> = {
  [VerificationType.ON_CHAIN]: 'bg-emerald-400',
  [VerificationType.ORACLE_DEPENDENT]: 'bg-amber-400',
  [VerificationType.OFF_CHAIN]: 'bg-slate-400',
};

export function AllocationBar({ policies }: AllocationBarProps) {
  if (policies.length === 0) return null;

  const totalWeight = policies.reduce(
    (sum, p) => sum + Number(p.vault.allocationWeight),
    0,
  );

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-gray-700">
        Policy Allocation
      </h3>

      {/* Stacked bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {policies.map((p) => {
          const widthPct =
            totalWeight > 0
              ? (Number(p.vault.allocationWeight) / totalWeight) * 100
              : 0;
          const color =
            SEGMENT_COLORS[p.global.verificationType] ?? 'bg-gray-300';

          return (
            <div
              key={Number(p.policyId)}
              className={`${color} transition-all duration-300`}
              style={{ width: `${widthPct}%` }}
              title={`${POLICY_NAMES[Number(p.policyId)] || `Policy #${p.policyId}`}: ${formatAllocationWeight(p.vault.allocationWeight)}`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-3">
        {policies.map((p) => {
          const vType = p.global.verificationType as VerificationType;
          const config = VERIFICATION_CONFIG[vType];
          const color =
            SEGMENT_COLORS[vType] ?? 'bg-gray-300';

          return (
            <div key={Number(p.policyId)} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
              <span className="text-xs text-gray-600">
                {POLICY_NAMES[Number(p.policyId)] || p.global.name}{' '}
                <span className="font-mono-num font-medium">
                  {formatAllocationWeight(p.vault.allocationWeight)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
