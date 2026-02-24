'use client';

import { useReceiptCount, useAllReceipts } from '@/hooks/useClaimReceipts';
import { useExerciseClaim } from '@/hooks/useClaimTrigger';
import { formatUSDC, shortenAddress } from '@/lib/formatting';

const POLICY_NAMES: Record<number, string> = {
  1: 'BTC Protection',
  2: 'Flight Delay',
  3: 'Commercial Fire',
};

export function ClaimReceipts() {
  const { data: receiptCount } = useReceiptCount();
  const { receipts, isLoading } = useAllReceipts(receiptCount);
  const exerciseClaim = useExerciseClaim();

  const pending = receipts.filter((r) => !r.exercised);
  const settled = receipts.filter((r) => r.exercised);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="mb-1 text-sm font-semibold text-gray-900">
        Claim Receipts
      </h3>
      <p className="mb-4 text-xs text-gray-500">
        Soulbound ERC-721 tokens representing draw-down rights. Claims
        auto-settle when the vault has sufficient funds.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-50" />
          ))}
        </div>
      ) : receipts.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">
          No claim receipts yet. Trigger a claim to mint a receipt.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Info banner when all claims are auto-settled */}
          {pending.length === 0 && settled.length > 0 && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs font-medium text-emerald-700">
                All claims auto-settled -- no pending receipts.
              </p>
            </div>
          )}

          {/* Pending (Shortfall) receipts */}
          {pending.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-amber-600">
                Pending / Shortfall ({pending.length})
              </h4>
              <p className="mb-2 text-xs text-gray-400">
                These claims need manual settlement due to insufficient vault funds at trigger time.
              </p>
              <div className="space-y-2">
                {pending.map((receipt) => (
                  <div
                    key={Number(receipt.receiptId)}
                    className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          Receipt #{Number(receipt.receiptId)}
                        </span>
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                          Shortfall
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                        <span>
                          Policy:{' '}
                          {POLICY_NAMES[Number(receipt.policyId)] ||
                            `#${Number(receipt.policyId)}`}
                        </span>
                        <span className="font-mono-num">
                          {formatUSDC(receipt.claimAmount)}
                        </span>
                        <span>Vault: {shortenAddress(receipt.vault)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        exerciseClaim.exercise(receipt.vault, receipt.receiptId)
                      }
                      disabled={exerciseClaim.isPending}
                      className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                    >
                      {exerciseClaim.isPending ? '...' : 'Exercise'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settled receipts */}
          {settled.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                Settled ({settled.length})
              </h4>
              <div className="space-y-2">
                {settled.map((receipt) => (
                  <div
                    key={Number(receipt.receiptId)}
                    className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50/50 p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-500">
                          Receipt #{Number(receipt.receiptId)}
                        </span>
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
                          Settled
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                        <span>
                          Policy:{' '}
                          {POLICY_NAMES[Number(receipt.policyId)] ||
                            `#${Number(receipt.policyId)}`}
                        </span>
                        <span className="font-mono-num">
                          {formatUSDC(receipt.claimAmount)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {exerciseClaim.error && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {(exerciseClaim.error as Error).message?.split('\n')[0] || 'Exercise failed'}
        </div>
      )}
    </div>
  );
}
