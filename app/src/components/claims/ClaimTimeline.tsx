'use client';

import { deriveClaimTimeline, type ClaimLike } from '@/lib/claimsqueue';

function fmtTs(ts?: bigint): string {
  if (!ts || ts === 0n) return '';
  return new Date(Number(ts) * 1000).toLocaleString();
}

/**
 * Per-claim decision timeline derived from on-chain state. Reached steps are
 * solid; pending steps are hollow. Only the two on-chain timestamps are shown;
 * full per-state actor/tx history needs the event indexer (sub-project 4).
 */
export function ClaimTimeline({ claim }: { claim: ClaimLike }) {
  const steps = deriveClaimTimeline(claim);
  return (
    <ol className="space-y-2">
      {steps.map((s) => (
        <li key={s.key} className="flex items-start gap-2">
          <span
            className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] ${
              s.reached ? 'bg-emerald-500 text-white' : 'border border-gray-300 text-transparent'
            }`}
          >
            ✓
          </span>
          <div className="min-w-0">
            <p className={`text-xs ${s.reached ? 'font-medium text-gray-900' : 'text-gray-400'}`}>{s.label}</p>
            {s.timestamp && s.timestamp > 0n && (
              <p className="text-[11px] text-gray-400">{fmtTs(s.timestamp)}</p>
            )}
          </div>
        </li>
      ))}
      <li className="pt-1 text-[11px] text-gray-400">Per-state actor/tx history requires the event ledger.</li>
    </ol>
  );
}
