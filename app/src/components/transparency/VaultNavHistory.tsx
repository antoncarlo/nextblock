'use client';

import { useEffect, useState } from 'react';
import {
  getProtocolSubgraphUrl,
  queryProtocolSubgraph,
  evaluateStaleness,
  NAV_SERIES_QUERY,
  parseNavPoints,
  type NavPointRow,
  type RawNavPoint,
} from '@/lib/protocol-subgraph';
import { DataSourceBadge } from '@/components/shared/DataSourceBadge';
import type { VaultSnapshot } from '@/lib/platform-metrics';

/**
 * Historical NAV per share, from indexed events.
 *
 * Current-state reads cannot produce history: this is the one figure on the
 * page that needs the indexer. When the subgraph endpoint is unset the section
 * says so plainly — it never draws a line from a single live point and calls it
 * a series.
 */
export function VaultNavHistory({ vaults }: { vaults: VaultSnapshot[] }) {
  const [selected, setSelected] = useState<string>('');
  const [points, setPoints] = useState<NavPointRow[]>([]);
  const [staleness, setStaleness] = useState<ReturnType<typeof evaluateStaleness> | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unconfigured' | 'error'>('idle');

  const vaultAddress = selected || vaults[0]?.address || '';

  useEffect(() => {
    if (!vaultAddress) return;
    let cancelled = false;
    // Every state commit happens in a promise callback, never synchronously in
    // the effect body: that is what keeps renders from cascading.
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        if (getProtocolSubgraphUrl() === null) {
          setState('unconfigured');
          return;
        }
        setState('loading');
        return queryProtocolSubgraph<{ navPoints: RawNavPoint[] }>(NAV_SERIES_QUERY, {
          vault: vaultAddress.toLowerCase(),
          n: 90,
        }).then((res) => {
          if (cancelled) return;
          setPoints(parseNavPoints(res.data.navPoints ?? []).reverse());
          // Freshness is judged against the clock at RESPONSE time, never during
          // render — the clock is an impure input.
          setStaleness(evaluateStaleness(res.meta, Math.floor(Date.now() / 1000)));
          setState('ready');
        });
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [vaultAddress]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Historical NAV per share</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Published NAV attestations over time — the record of what the vault was worth.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {vaults.length > 1 && (
            <select
              value={vaultAddress}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
            >
              {vaults.map((v) => (
                <option key={v.address} value={v.address}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
          <DataSourceBadge
            source={state === 'ready' ? 'onchain' : 'unavailable'}
            title={
              state === 'ready'
                ? 'Indexed on-chain NAV attestations'
                : 'History requires the protocol subgraph'
            }
          />
        </div>
      </div>

      {state === 'unconfigured' && (
        <p className="py-10 text-center text-sm text-gray-400">
          NAV history needs the protocol subgraph. Current-state reads cannot produce a time series,
          so nothing is drawn here rather than showing an invented line.
        </p>
      )}
      {state === 'loading' && <div className="mt-4 h-40 animate-pulse rounded-lg bg-gray-100" />}
      {state === 'error' && (
        <p className="py-10 text-center text-sm text-red-600">
          The indexer did not respond. No substitute data is shown.
        </p>
      )}
      {state === 'ready' && points.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-400">
          No NAV has been published for this vault yet.
        </p>
      )}
      {state === 'ready' && points.length > 0 && (
        <>
          <NavSparkline points={points} />
          {staleness?.stale && (
            <p className="mt-2 text-xs text-amber-700">
              Indexed data is {Math.round(staleness.ageSeconds / 60)} minutes behind the chain.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Line chart in raw SVG — a series of NAV points needs no charting library. */
function NavSparkline({ points }: { points: NavPointRow[] }) {
  const w = 720;
  const h = 180;
  const pad = 28;

  const values = points.map((p) => Number(p.nav) / 1e6);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const coords = values.map((v, i) => {
    const x = pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x},${y}`;
  });

  const first = values[0];
  const last = values[values.length - 1];
  const up = last >= first;
  const stroke = up ? '#047857' : '#B91C1C';

  return (
    <div className="mt-4 overflow-x-auto">
      <svg width={w} height={h} role="img" aria-label="NAV per share over time" style={{ maxWidth: '100%' }}>
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#E5E7EB" />
        <polyline points={coords.join(' ')} fill="none" stroke={stroke} strokeWidth={2} />
        <text x={pad} y={16} fontSize={11} fill="#6B7280">
          ${max.toFixed(4)}
        </text>
        <text x={pad} y={h - pad + 14} fontSize={11} fill="#6B7280">
          ${min.toFixed(4)}
        </text>
        <text x={w - pad} y={16} fontSize={11} fill={stroke} textAnchor="end">
          now ${last.toFixed(4)}
        </text>
      </svg>
      <p className="mt-1 text-xs text-gray-500">
        {points.length} attestation{points.length === 1 ? '' : 's'} ·{' '}
        {new Date(points[0].timestamp * 1000).toLocaleDateString()} →{' '}
        {new Date(points[points.length - 1].timestamp * 1000).toLocaleDateString()}
      </p>
    </div>
  );
}
