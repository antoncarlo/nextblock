'use client';

import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { useRedemptionHistory } from '@/hooks/useRedemptionHistory';
import { formatUSDC } from '@/lib/formatting';
import { SHARE_SYMBOL } from '@/lib/disclosure';

const fmtShares = (v: bigint) => Number(formatUnits(v, 18)).toFixed(2);
const fmtDate = (ts: number) => (ts > 0 ? new Date(ts * 1000).toLocaleDateString() : '—');
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

/**
 * Indexed LP exit history (Goldsky subgraph): recent epoch settlements plus the
 * connected wallet's own requests and claims. Complements the on-chain
 * current-state panel with the time series it cannot show.
 */
export function RedemptionHistory() {
  const { address, isConnected } = useAccount();
  const h = useRedemptionHistory(address);

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Exit history</h3>
        <button type="button" onClick={h.refetch} className="text-xs text-gray-500 underline hover:text-gray-800">
          refresh
        </button>
      </div>

      <div className="space-y-5 p-4">
        {h.error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">history unavailable: {h.error}</p>}
        {h.loading && <p className="text-center text-xs text-gray-400">loading indexed history…</p>}

        {/* Protocol-wide settlements */}
        <Section title="Recent epoch settlements">
          {h.settlements.length === 0 ? (
            <Empty label="No settlements yet." />
          ) : (
            <Table head={['Epoch', 'Settled', 'Assets', 'Ratio', 'Date']}>
              {h.settlements.map((s) => (
                <tr key={s.txHash + s.epochId.toString()} className="border-t border-gray-100">
                  <Td>#{s.epochId.toString()}</Td>
                  <Td>{fmtShares(s.settledShares)} {SHARE_SYMBOL}</Td>
                  <Td>{formatUSDC(s.settledAssets)} USDC</Td>
                  <Td>{pct(s.ratioBps)}</Td>
                  <Td>{fmtDate(s.timestamp)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        {/* Connected LP's own activity */}
        {isConnected && (
          <Section title="Your requests & claims">
            {h.requests.length === 0 && h.claims.length === 0 ? (
              <Empty label="No requests or claims yet." />
            ) : (
              <Table head={['Type', 'Epoch', 'Amount', 'Date']}>
                {h.requests.map((r) => (
                  <tr key={'req' + r.txHash} className="border-t border-gray-100">
                    <Td>Request</Td>
                    <Td>#{r.epochId.toString()}</Td>
                    <Td>{fmtShares(r.shares)} {SHARE_SYMBOL}</Td>
                    <Td>{fmtDate(r.timestamp)}</Td>
                  </tr>
                ))}
                {h.claims.map((c) => (
                  <tr key={'clm' + c.txHash} className="border-t border-gray-100">
                    <Td>Claim</Td>
                    <Td>#{c.epochId.toString()}</Td>
                    <Td>
                      {formatUSDC(c.assetsPaid)} USDC
                      {c.sharesReturned > 0n && ` + ${fmtShares(c.sharesReturned)} ${SHARE_SYMBOL}`}
                    </Td>
                    <Td>{fmtDate(c.timestamp)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-gray-500">{title}</p>
      {children}
    </div>
  );
}
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    // Horizontal scroll on phones instead of crushing the columns.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr className="text-left text-gray-400">
            {head.map((h) => (
              <th key={h} className="pb-1 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-1 text-gray-700">{children}</td>;
}
function Empty({ label }: { label: string }) {
  return <p className="text-xs text-gray-400">{label}</p>;
}
