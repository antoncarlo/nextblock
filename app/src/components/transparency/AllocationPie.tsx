'use client';

import { formatUSDCCompact } from '@/lib/formatting';
import { fmtBps, type AllocationSlice } from '@/lib/platform-metrics';

/**
 * Donut chart, hand-drawn in SVG — no charting dependency for four arcs.
 * A single slice renders as a full ring (arc maths degenerates at 360°).
 */
export function AllocationPie({
  title,
  subtitle,
  slices,
  emptyLabel = 'No capital allocated yet',
}: {
  title: string;
  subtitle?: string;
  slices: AllocationSlice[];
  emptyLabel?: string;
}) {
  const total = slices.reduce((acc, s) => acc + s.value, 0n);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}

      {slices.length === 0 || total === 0n ? (
        <p className="py-10 text-center text-sm text-gray-400">{emptyLabel}</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <Donut slices={slices} />
          <ul className="min-w-[190px] flex-1 space-y-2">
            {slices.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                  <span className="truncate text-gray-700">{s.label}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-semibold text-gray-900">{fmtBps(s.bps)}</span>
                  <span className="ml-2 text-gray-400">{formatUSDCCompact(s.value)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Donut({ slices }: { slices: AllocationSlice[] }) {
  const size = 160;
  const r = 62;
  const inner = 40;
  const c = size / 2;

  if (slices.length === 1) {
    return (
      <svg width={size} height={size} role="img" aria-label={`${slices[0].label}: 100%`}>
        <circle cx={c} cy={c} r={(r + inner) / 2} fill="none" stroke={slices[0].color} strokeWidth={r - inner} />
      </svg>
    );
  }

  // Arc offsets are derived with a pure scan: no mutable accumulator survives
  // the render, which keeps the component compiler-safe.
  const START = -Math.PI / 2; // 12 o'clock
  const paths = slices.map((sl, i) => {
    const startBps = slices.slice(0, i).reduce((acc, prev) => acc + prev.bps, 0);
    const angle = START + (startBps / 10_000) * Math.PI * 2;
    const sweep = (sl.bps / 10_000) * Math.PI * 2;
    const end = angle + sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const d = [
      `M ${c + r * Math.cos(angle)} ${c + r * Math.sin(angle)}`,
      `A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(end)} ${c + r * Math.sin(end)}`,
      `L ${c + inner * Math.cos(end)} ${c + inner * Math.sin(end)}`,
      `A ${inner} ${inner} 0 ${large} 0 ${c + inner * Math.cos(angle)} ${c + inner * Math.sin(angle)}`,
      'Z',
    ].join(' ');
    return { d, color: sl.color, label: sl.label, bps: sl.bps };
  });

  return (
    <svg width={size} height={size} role="img" aria-label="Allocation breakdown">
      {paths.map((p) => (
        <path key={p.label} d={p.d} fill={p.color}>
          <title>{`${p.label}: ${fmtBps(p.bps)}`}</title>
        </path>
      ))}
    </svg>
  );
}
