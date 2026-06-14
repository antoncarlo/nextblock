'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useProtocolAccess } from '@/hooks/useProtocolAccess';
import {
  useAllPortfolios,
  PortfolioStatus,
  PORTFOLIO_STATUS_LABEL,
  PORTFOLIO_STATUS_COLOR,
  STRUCTURE_LABEL,
  StructureType,
  formatUsdc,
  formatDate,
  type PortfolioView,
} from '@/hooks/usePortfolioRegistry';
import { usePortfolioActions } from '@/hooks/usePortfolioActions';
import { validatePortfolioForm, type PortfolioFormInput } from '@/lib/portfolio/form';
import { DataSourceBadge } from '@/components/shared/DataSourceBadge';

/**
 * Portfolio onboarding panel: the institutional submit -> review -> approve ->
 * activate lifecycle of PortfolioRegistry, role-aware. Cedants submit and track
 * their own portfolios; Underwriting Curators review/approve/reject/activate.
 * Reads come from the canonical on-chain registry; nothing privileged is
 * reachable without the corresponding on-chain role. Onboarding only: no
 * allocation, premium or fee actions here.
 */
export function PortfolioPanel({ mode = 'auto' }: { mode?: 'auto' | 'cedant' | 'curator' }) {
  const { isConnected } = useAccount();
  const access = useProtocolAccess();
  const { deployed, portfolios, isLoading, count, refetch } = useAllPortfolios();
  const actions = usePortfolioActions(() => refetch());

  if (!deployed) {
    return (
      <Card>
        <Header />
        <p className="mt-3 text-xs text-red-700">
          PortfolioRegistry is not deployed on this network. No portfolio data is shown by design.
        </p>
      </Card>
    );
  }

  const showCedant = mode !== 'curator';
  const showCurator = mode !== 'cedant';

  return (
    <Card>
      <Header />
      <p className="mb-4 text-xs text-gray-500">
        Institutional onboarding lifecycle: a cedant submits a portfolio, the Underwriting
        Curator reviews and approves it, then activates it so vaults can allocate. Allocation,
        premium and fees are handled elsewhere.
      </p>

      {actions.isWrongChain && (
        <div className="mb-3 rounded-lg bg-amber-50 p-3 text-xs font-medium text-amber-800">
          Please switch to Base Sepolia (chain 84532) to act on portfolios.
        </div>
      )}
      {actions.error && (
        <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{actions.error}</div>
      )}
      {actions.isSuccess && (
        <div className="mb-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">Transaction confirmed.</div>
      )}

      {!isConnected && (
        <p className="text-xs text-gray-400">Connect a wallet to submit or review portfolios.</p>
      )}

      {isConnected && showCedant && access.isCedant && <SubmitPortfolioForm actions={actions} />}

      {isConnected && !access.isCedant && !access.isCurator && (
        <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
          This wallet holds neither AUTHORIZED_CEDANT_ROLE (to submit) nor
          UNDERWRITING_CURATOR_ROLE (to review) on ProtocolRoles. Ask the operator to grant the
          appropriate role.
        </p>
      )}

      {isConnected && (
        <PortfolioList
          portfolios={portfolios}
          isLoading={isLoading}
          count={count}
          access={access}
          actions={actions}
          showCurator={showCurator}
        />
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-6">{children}</div>;
}

function Header() {
  return (
    <div className="mb-1 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-gray-900">Portfolio Onboarding</h3>
      <DataSourceBadge source="onchain" title="Portfolios read from PortfolioRegistry" />
    </div>
  );
}

type Actions = ReturnType<typeof usePortfolioActions>;
type Access = ReturnType<typeof useProtocolAccess>;

const EMPTY_FORM: PortfolioFormInput = {
  name: '',
  lineOfBusiness: '',
  jurisdiction: '',
  structureType: StructureType.QUOTA_SHARE,
  coverageLimit: '',
  cededPremium: '',
  inceptionDate: '',
  expiryDate: '',
  metadataURI: '',
  evidenceReference: '',
};

function SubmitPortfolioForm({ actions }: { actions: Actions }) {
  const [form, setForm] = useState<PortfolioFormInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<string[]>([]);
  const pending = actions.isPending || actions.isConfirming;

  const set = <K extends keyof PortfolioFormInput>(k: K, v: PortfolioFormInput[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    const result = validatePortfolioForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    actions.submitPortfolio(result.params);
  };

  const input = 'rounded-lg border border-gray-200 px-3 py-2 text-xs';

  return (
    <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
      <p className="mb-3 text-xs font-semibold text-gray-700">Submit a portfolio (Cedant)</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <input className={input} placeholder="Name (e.g. EU Property CAT QS 2026)" value={form.name} onChange={e => set('name', e.target.value)} />
        <input className={input} placeholder="Line of business (e.g. Property CAT)" value={form.lineOfBusiness} onChange={e => set('lineOfBusiness', e.target.value)} />
        <input className={input} placeholder="Jurisdiction (e.g. EU)" value={form.jurisdiction} onChange={e => set('jurisdiction', e.target.value)} />
        <select className={input} value={form.structureType} onChange={e => set('structureType', Number(e.target.value) as StructureType)}>
          {Object.entries(STRUCTURE_LABEL).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <input className={input} placeholder="Coverage limit (USDC)" value={form.coverageLimit} onChange={e => set('coverageLimit', e.target.value)} />
        <input className={input} placeholder="Ceded premium (USDC)" value={form.cededPremium} onChange={e => set('cededPremium', e.target.value)} />
        <label className="text-[11px] text-gray-500">Inception<input type="date" className={`${input} mt-1 block w-full`} value={form.inceptionDate} onChange={e => set('inceptionDate', e.target.value)} /></label>
        <label className="text-[11px] text-gray-500">Expiry<input type="date" className={`${input} mt-1 block w-full`} value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)} /></label>
        <input className={`${input} md:col-span-2`} placeholder="Metadata URI (optional, e.g. ipfs://...)" value={form.metadataURI} onChange={e => set('metadataURI', e.target.value)} />
        <input className={`${input} md:col-span-2`} placeholder="Evidence reference (hashed to documentHash)" value={form.evidenceReference} onChange={e => set('evidenceReference', e.target.value)} />
      </div>
      {errors.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-red-700">
          {errors.map(e => <li key={e}>{e}</li>)}
        </ul>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
      >
        {pending ? 'Submitting...' : 'Submit portfolio'}
      </button>
    </div>
  );
}

function PortfolioList({
  portfolios,
  isLoading,
  count,
  access,
  actions,
  showCurator,
}: {
  portfolios: PortfolioView[];
  isLoading: boolean;
  count: number;
  access: Access;
  actions: Actions;
  showCurator: boolean;
}) {
  const { address } = useAccount();
  // Cedants see only their own portfolios; curators see all.
  const visible = access.isCurator
    ? portfolios
    : portfolios.filter(p => address && p.cedant.toLowerCase() === address.toLowerCase());

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-gray-500">{count} portfolio(s) on record</p>
      {isLoading && portfolios.length === 0 && <p className="text-xs text-gray-400">Loading portfolios...</p>}
      {!isLoading && visible.length === 0 && (
        <p className="text-xs text-gray-400">
          {access.isCurator ? 'No portfolios submitted yet.' : 'You have no portfolios yet.'}
        </p>
      )}
      {visible.map(p => (
        <PortfolioRow
          key={p.portfolioId.toString()}
          portfolio={p}
          access={access}
          actions={actions}
          showCurator={showCurator}
        />
      ))}
    </div>
  );
}

function PortfolioRow({
  portfolio: p,
  access,
  actions,
  showCurator,
}: {
  portfolio: PortfolioView;
  access: Access;
  actions: Actions;
  showCurator: boolean;
}) {
  const [reason, setReason] = useState('');
  const [lossBps, setLossBps] = useState('');
  const sc = PORTFOLIO_STATUS_COLOR[p.status];
  const pending = actions.isPending || actions.isConfirming;
  const curator = showCurator && access.isCurator;

  return (
    <div className="rounded-lg border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-gray-900">{p.name || `Portfolio #${p.portfolioId.toString()}`}</span>
          <span className="ml-2 text-xs text-gray-400">
            #{p.portfolioId.toString()} · {p.lineOfBusiness || 'n/a'} · {STRUCTURE_LABEL[p.structureType]}
          </span>
        </div>
        <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: sc.bg, color: sc.color }}>
          {PORTFOLIO_STATUS_LABEL[p.status]}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600 md:grid-cols-3">
        <span>Coverage: ${formatUsdc(p.coverageLimit)}</span>
        <span>Ceded premium: ${formatUsdc(p.cededPremium)}</span>
        <span>Jurisdiction: {p.jurisdiction || 'n/a'}</span>
        <span>Inception: {formatDate(p.inceptionTime)}</span>
        <span>Expiry: {formatDate(p.expiryTime)}</span>
        <span>Expected loss: {p.expectedLossBps} bps</span>
      </div>

      {curator && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.status === PortfolioStatus.SUBMITTED && (
            <ActionButton label="Start review" onClick={() => actions.startReview(p.portfolioId)} disabled={pending} />
          )}
          {p.status === PortfolioStatus.UNDER_REVIEW && (
            <>
              <input
                value={lossBps}
                onChange={e => setLossBps(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Expected loss bps (0-10000)"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
              />
              <ActionButton
                label="Approve"
                primary
                disabled={pending || lossBps === '' || Number(lossBps) > 10_000}
                onClick={() => actions.approvePortfolio(p.portfolioId, Number(lossBps))}
              />
            </>
          )}
          {p.status === PortfolioStatus.APPROVED && (
            <ActionButton label="Activate" primary onClick={() => actions.activatePortfolio(p.portfolioId)} disabled={pending} />
          )}
          {(p.status === PortfolioStatus.SUBMITTED || p.status === PortfolioStatus.UNDER_REVIEW) && (
            <div className="flex w-full flex-wrap items-center gap-2">
              <input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Rejection reason"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
              />
              <ActionButton label="Reject" onClick={() => actions.rejectPortfolio(p.portfolioId, reason.trim() || 'curator rejection')} disabled={pending} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        primary
          ? 'rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400'
          : 'rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50'
      }
    >
      {label}
    </button>
  );
}
