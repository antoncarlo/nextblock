'use client';

import { usePolicyCount, useAllPolicies } from '@/hooks/usePolicyRegistry';
import { useCurrentTime } from '@/hooks/usePolicyRegistry';
import { VerificationBadge } from '@/components/shared/VerificationBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatUSDC, formatDuration } from '@/lib/formatting';

export function PolicyPool() {
  const { data: count } = usePolicyCount();
  const { data: policiesData, isLoading } = useAllPolicies(count);
  const { data: currentTime } = useCurrentTime();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="mb-1 text-sm font-semibold text-gray-900">
        Policy Pool
      </h3>
      <p className="mb-4 text-xs text-gray-500">
        All registered policies in the PolicyRegistry.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-50" />
          ))}
        </div>
      ) : !policiesData || policiesData.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">
          No policies registered yet.
        </p>
      ) : (
        <div className="space-y-2">
          {policiesData.map((result, idx) => {
            if (result.status !== 'success' || !result.result) return null;

            const policy = result.result as unknown as {
              id: bigint;
              name: string;
              verificationType: number;
              coverageAmount: bigint;
              premiumAmount: bigint;
              duration: bigint;
              startTime: bigint;
              insurer: `0x${string}`;
              triggerThreshold: bigint;
              status: number;
            };

            return (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        #{Number(policy.id)} {policy.name}
                      </span>
                      <VerificationBadge type={policy.verificationType} />
                      <StatusBadge status={policy.status} />
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                      <span>
                        Coverage: <span className="font-mono-num">{formatUSDC(policy.coverageAmount)}</span>
                      </span>
                      <span>
                        Premium: <span className="font-mono-num">{formatUSDC(policy.premiumAmount)}</span>
                      </span>
                      <span>Duration: {formatDuration(policy.duration)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
