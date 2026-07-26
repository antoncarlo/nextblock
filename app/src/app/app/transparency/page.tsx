'use client';

import Link from 'next/link';
import { usePlatformSnapshot } from '@/hooks/usePlatformSnapshot';
import { AllocationPie } from '@/components/transparency/AllocationPie';
import { VaultNavHistory } from '@/components/transparency/VaultNavHistory';
import { DataSourceBadge } from '@/components/shared/DataSourceBadge';
import { formatUSDCCompact, shortenAddress } from '@/lib/formatting';
import { capitalAllocation, vaultAllocation, reserveHealth, sharePrice, fmtBps } from '@/lib/platform-metrics';

/**
 * Transparency — the protocol seen from outside: every deployed vault and what
 * the capital is doing, aggregated live from chain. The vault list comes from
 * the factory, so new vaults appear here on their own.
 *
 * Read-only by construction, and honest by construction: figures that are not
 * measurable from on-chain state are absent rather than estimated.
 */
export default function TransparencyPage() {
  const { vaults, totals, isLoading, hasFactory } = usePlatformSnapshot();
  const capital = capitalAllocation(totals);
  const perVault = vaultAllocation(vaults, totals.tvl);
  const reserves = reserveHealth(vaults, totals);

  return (
    <div data-track-section="transparency" style={{ minHeight: '100vh', backgroundColor: '#FAFAF8' }}>
      <div className="mx-auto px-4 py-8 sm:px-8" style={{ maxWidth: '1200px' }}>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="section-label" style={{ marginBottom: 4 }}>Protocol transparency</p>
            <h1
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 26,
                fontWeight: 400,
                color: '#0F1218',
              }}
            >
              Every vault, every unit of capacity
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              Aggregated live from Base across all deployed vaults. New vaults appear here
              automatically — the list is read from the on-chain factory, not maintained by hand.
            </p>
          </div>
          <DataSourceBadge source="onchain" title="Every figure on this page is read from chain" />
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : !hasFactory ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="text-sm font-medium text-red-900">Protocol state unavailable</p>
            <p className="mt-1 text-xs text-red-800">
              The vault factory could not be read on this network. No substitute figures are shown.
            </p>
          </div>
        ) : (
          <>
            {/* Headline platform performance */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                label="Total value locked"
                value={formatUSDCCompact(totals.tvl)}
                note={`${totals.vaultCount} vault${totals.vaultCount === 1 ? '' : 's'}`}
              />
              <Kpi
                label="Deployed to underwriting"
                value={formatUSDCCompact(totals.deployedCapital)}
                note={`${fmtBps(totals.utilisationBps)} of TVL`}
              />
              <Kpi
                label="Liquidity buffer"
                value={formatUSDCCompact(totals.availableBuffer)}
                note={`${fmtBps(totals.bufferBps)} of TVL`}
              />
              <Kpi label="Policies backed" value={String(totals.policyCount)} note="active across all vaults" />
            </div>

            {totals.unreadableCount > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                {totals.unreadableCount} vault{totals.unreadableCount === 1 ? '' : 's'} could not be
                read and {totals.unreadableCount === 1 ? 'is' : 'are'} excluded from these totals —
                not counted as zero.
              </p>
            )}

            {/* Allocation */}
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <AllocationPie
                title="Capital allocation"
                subtitle="What the protocol's capital is doing right now"
                slices={capital}
              />
              <AllocationPie
                title="Capacity by vault"
                subtitle="Where underwriting capacity sits"
                slices={perVault}
                emptyLabel="No vault holds capital yet"
              />
            </div>

            {/* Reserve security */}
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Reserve security</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Liquidity kept redeemable, against the floor each vault is configured to hold —
                    weighted by vault size.
                  </p>
                </div>
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={
                    reserves.meetsFloor
                      ? { background: 'rgba(4,120,87,0.08)', color: '#047857' }
                      : { background: 'rgba(185,28,28,0.08)', color: '#B91C1C' }
                  }
                >
                  {reserves.meetsFloor ? 'Buffer above floor' : 'Buffer below floor'}
                </span>
              </div>

              <div className="mt-4">
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${Math.min(100, reserves.bufferBps / 100)}%`,
                      background: reserves.meetsFloor ? '#047857' : '#B91C1C',
                    }}
                  />
                  <div
                    className="absolute inset-y-0 w-0.5 bg-gray-900"
                    style={{ left: `${Math.min(100, reserves.requiredBps / 100)}%` }}
                    title={`Configured floor: ${fmtBps(reserves.requiredBps)}`}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-gray-500">
                  <span>
                    Live buffer <strong className="text-gray-900">{fmtBps(reserves.bufferBps)}</strong>
                  </span>
                  <span>
                    Configured floor <strong className="text-gray-900">{fmtBps(reserves.requiredBps)}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Per-vault table with live share price */}
            <div className="mt-6 rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-5 py-3">
                <h3 className="text-sm font-semibold text-gray-900">All deployed vaults</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ minWidth: 700 }}>
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left">
                      {['Vault', 'TVL', 'Share price', 'Deployed', 'Buffer', 'Policies'].map((h) => (
                        <th
                          key={h}
                          className="px-5 py-2 text-[11px] font-medium uppercase tracking-wider text-gray-500"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vaults.map((v) => (
                      <tr key={v.address} className="border-b border-gray-50 last:border-b-0">
                        <td className="px-5 py-3">
                          <Link
                            href={`/app/vault/${v.address}`}
                            className="text-sm font-medium text-gray-900 hover:underline"
                          >
                            {v.name}
                          </Link>
                          <p className="mt-0.5 text-[11px] text-gray-400">{shortenAddress(v.address)}</p>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-700">{formatUSDCCompact(v.totalAssets)}</td>
                        <td className="px-5 py-3 text-sm text-gray-700">
                          ${sharePrice(v.totalAssets, v.totalSupply).toFixed(4)}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-700">{formatUSDCCompact(v.deployedCapital)}</td>
                        <td className="px-5 py-3 text-sm text-gray-700">{formatUSDCCompact(v.availableBuffer)}</td>
                        <td className="px-5 py-3 text-sm text-gray-700">{v.policyCount}</td>
                      </tr>
                    ))}
                    {vaults.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">
                          No vaults deployed on this network yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Historical NAV per share, from indexed events */}
            <div className="mt-6">
              <VaultNavHistory vaults={vaults} />
            </div>

            <p className="mt-6 text-xs leading-5 text-gray-400">
              Share price is vault NAV divided by shares outstanding: it rises as premiums are earned
              and falls when claims are paid. Figures update as the chain does — nothing on this page
              is modelled or forecast.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p
        className="mt-1"
        style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 24, color: '#0F1218' }}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-gray-400">{note}</p>
    </div>
  );
}
