'use client';

import { useState, Fragment } from 'react';
import {
  useAllClaims,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_COLOR,
  formatUsdc,
  type ClaimStatus,
} from '@/hooks/useClaimLifecycle';
import { filterClaims, isOverdue, claimAgeSeconds, severityOf } from '@/lib/claimsqueue';
import { ClaimTimeline } from './ClaimTimeline';
import { EvidencePanel } from './EvidencePanel';

const SLA_THRESHOLD_SEC = 7n * 24n * 60n * 60n; // 7 days
const STATUS_VALUES = [0, 1, 2, 3, 4, 5] as const;

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/**
 * Claims Control Room (sub-project 1): filterable queue of all claims read from
 * the lens, with SLA-age badges and a per-row decision timeline. Read-only;
 * actions live in the embedded ClaimLifecyclePanel.
 */
export function ClaimsControlRoom() {
  const { claims, lensDeployed, isLoading } = useAllClaims();
  const [statusFilter, setStatusFilter] = useState<number | 'all'>('all');
  const [vaultFilter, setVaultFilter] = useState<string>('all');
  const [anomalyOnly, setAnomalyOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // eslint-disable-next-line
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const vaults = Array.from(new Set(claims.map((c) => c.vault)));
  const rows = filterClaims(claims, {
    status: statusFilter === 'all' ? undefined : statusFilter,
    vault: vaultFilter === 'all' ? undefined : (vaultFilter as `0x${string}`),
    anomalyOnly,
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Claims Control Room</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="rounded-md border border-gray-200 px-2 py-1"
          >
            <option value="all">All statuses</option>
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {CLAIM_STATUS_LABEL[s as ClaimStatus]}
              </option>
            ))}
          </select>
          <select
            value={vaultFilter}
            onChange={(e) => setVaultFilter(e.target.value)}
            className="rounded-md border border-gray-200 px-2 py-1"
          >
            <option value="all">All vaults</option>
            {vaults.map((v) => (
              <option key={v} value={v}>
                {shortAddr(v)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-gray-600">
            <input type="checkbox" checked={anomalyOnly} onChange={(e) => setAnomalyOnly(e.target.checked)} />
            Anomaly only
          </label>
        </div>
      </div>

      <div className="p-4">
        {!lensDeployed ? (
          <p className="py-8 text-center text-sm text-gray-500">Claims read model unavailable on this network.</p>
        ) : isLoading ? (
          <p className="py-8 text-center text-sm text-gray-400">Loading claims…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No claims match the current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="py-1 pr-3">#</th>
                  <th className="py-1 pr-3">Vault</th>
                  <th className="py-1 pr-3">Amount</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3">Age</th>
                  <th className="py-1 pr-3">Severity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const overdue = isOverdue(c, nowSec, SLA_THRESHOLD_SEC);
                  const ageDays = Number(claimAgeSeconds(c, nowSec) / 86_400n);
                  const sev = severityOf(c);
                  const color = CLAIM_STATUS_COLOR[c.status as ClaimStatus];
                  const id = c.claimId.toString();
                  return (
                    <Fragment key={id}>
                      <tr
                        onClick={() => setExpanded(expanded === id ? null : id)}
                        className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-2 pr-3 font-medium text-gray-900">{id}</td>
                        <td className="py-2 pr-3 text-gray-600">{shortAddr(c.vault)}</td>
                        <td className="py-2 pr-3 text-gray-900">{formatUsdc(c.requestedAmount)} USDC</td>
                        <td className="py-2 pr-3">
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ backgroundColor: color?.bg, color: color?.color }}
                          >
                            {CLAIM_STATUS_LABEL[c.status as ClaimStatus]}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={overdue ? 'font-medium text-red-700' : 'text-gray-600'}>
                            {ageDays}d{overdue ? ' • overdue' : ''}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={sev === 'high' ? 'font-medium text-amber-700' : 'text-gray-500'}>
                            {sev}
                          </span>
                        </td>
                      </tr>
                      {expanded === id && (
                        <tr className="border-t border-gray-50 bg-gray-50/50">
                          <td colSpan={6} className="px-3 py-3">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <ClaimTimeline claim={c} />
                              <EvidencePanel claimId={c.claimId} evidenceHash={c.evidenceHash} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 px-4 py-2">
        <p className="text-[11px] leading-snug text-gray-400">
          SLA age is display-only (alerting is the monitoring workstream). Evidence shown on-chain as a hash;
          document upload/preview and notifications are later sub-projects.
        </p>
      </div>
    </div>
  );
}
