'use client';

import { useMoneyFlow } from '@/hooks/useMoneyFlow';
import { bpsToPct } from '@/lib/moneyflow';
import { formatUSDC } from '@/lib/formatting';
import { DataSourceBadge } from '@/components/shared/DataSourceBadge';

/**
 * Money Flow dashboard (Figma module 06): SPV Calculation, % Buffer, % Flag/
 * Protocol, Investor Vault, Claim Payment, Protocol Fee — derived live from the
 * canonical on-chain read model. Current-state only (no historical timeline).
 */
export function MoneyFlowDashboard({ vault }: { vault?: `0x${string}` }) {
  const { available, view } = useMoneyFlow(vault);

  if (!available || !view) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Money Flow</h3>
          <DataSourceBadge source="unavailable" />
        </div>
        <p className="px-4 py-8 text-center text-sm text-gray-500">
          Money Flow data is unavailable on this network (lens or vault not reachable).
        </p>
      </div>
    );
  }

  const usd = (v: bigint) => `${formatUSDC(v)} USDC`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Money Flow</h3>
        <DataSourceBadge source="onchain" />
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <Card title="SPV Calculation" primary={usd(view.spvCalculation.nav)}>
          <Row label="Balance" value={usd(view.spvCalculation.balance)} />
          <Row label="− Unearned premium (UPR)" value={usd(view.spvCalculation.unearnedPremiums)} />
          <Row label="− Pending claims" value={usd(view.spvCalculation.pendingClaims)} />
          <Row label="− Accrued fees" value={usd(view.spvCalculation.fees)} />
          <Row label="= NAV" value={usd(view.spvCalculation.nav)} strong />
        </Card>

        <Card title="% Buffer" primary={bpsToPct(view.buffer.currentBps)}>
          <Row label="Free liquidity" value={usd(view.buffer.current)} />
          <Row label="Target" value={bpsToPct(view.buffer.targetBps)} />
        </Card>

        <Card title="% Flag / Protocol" primary={bpsToPct(view.protocolFlagBps)}>
          <Row label="Protocol take on premium" value={bpsToPct(view.protocolFlagBps)} />
        </Card>

        <Card title="Investor Vault" primary={usd(view.investorVault.totalAssets)}>
          <Row label="NAV per share" value={usd(view.investorVault.sharePrice)} />
        </Card>

        <Card title="Claim Payment" primary={usd(view.claimPayment.reserveHeld)}>
          <Row label="Reserve held" value={usd(view.claimPayment.reserveHeld)} />
          <Row label="Cumulative paid" value="— (needs ledger)" />
        </Card>

        <Card title="Protocol Fee" primary={usd(view.protocolFee.accruedProtocol)}>
          <Row label="Accrued protocol fee" value={usd(view.protocolFee.accruedProtocol)} />
          <Row label="Accrued management fee" value={usd(view.protocolFee.managementAccrued)} />
        </Card>
      </div>

      <div className="border-t border-gray-100 px-4 py-2">
        <p className="text-[11px] leading-snug text-gray-400">
          Current-state view derived from the on-chain read model. Historical flows (timeline,
          realized yield, cumulative payouts) require the event indexer and are not shown here.
        </p>
      </div>
    </div>
  );
}

function Card({ title, primary, children }: { title: string; primary: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <p className="text-xs text-gray-500">{title}</p>
      <p className="mb-2 text-lg font-semibold text-gray-900">{primary}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={strong ? 'font-semibold text-gray-900' : 'text-gray-700'}>{value}</span>
    </div>
  );
}
