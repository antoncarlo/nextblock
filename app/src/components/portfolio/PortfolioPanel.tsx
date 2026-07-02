'use client';

import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { keccak256 } from 'viem';
import { cedantAuthMessage } from '@/lib/portfolio/authMessage';
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
import { summarizeBordereau, summarizeBordereauRows, type BordereauResult } from '@/lib/portfolio/bordereau';
import { parseXlsx, isZipFile } from '@/lib/portfolio/xlsx';
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

  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [pin, setPin] = useState<{ kind: 'idle' | 'pinning' | 'done' | 'error'; msg?: string; cid?: string }>({
    kind: 'idle',
  });

  // Real document integrity: hash the actual bytes, sign a cedant-scoped
  // message binding that hash, and pin to IPFS. The route re-derives the hash
  // server-side, so the signature is bound to the exact file. On success the
  // real documentHash + ipfs:// metadataURI flow into the on-chain submission.
  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!address) {
      setPin({ kind: 'error', msg: 'Connect a wallet first.' });
      return;
    }
    setPin({ kind: 'pinning' });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const documentHash = keccak256(bytes);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await signMessageAsync({
        message: cedantAuthMessage(`portfolio:pin:${documentHash}`, timestamp),
      });
      const fd = new FormData();
      fd.append('file', file);
      fd.append('address', address);
      fd.append('timestamp', String(timestamp));
      fd.append('signature', signature);
      const res = await fetch('/api/portfolio/pin', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPin({ kind: 'error', msg: typeof data.error === 'string' ? data.error : `HTTP ${res.status}` });
        return;
      }
      setForm(f => ({ ...f, metadataURI: data.metadataURI, pinnedDocumentHash: data.documentHash }));
      setPin({ kind: 'done', cid: data.cid });
    } catch {
      setPin({ kind: 'error', msg: 'Signature rejected or upload failed.' });
    }
  };

  // Bordereau import: parse the policy schedule (Excel .xlsx directly, or a
  // CSV export), derive the PORTFOLIO-level aggregate (total coverage/premium,
  // treaty period, dominant line/jurisdiction) into the form, and pin the same
  // file as the on-chain document — so the numbers and the fingerprint both
  // come from the real bordereau instead of being typed by hand.
  const [bdx, setBdx] = useState<{ policyCount: number; warnings: string[] } | null>(null);
  const [bdxError, setBdxError] = useState<string | null>(null);

  const onImportBordereau = async (file: File | undefined) => {
    if (!file) return;
    setBdxError(null);
    setBdx(null);
    let res: BordereauResult;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (isZipFile(bytes)) {
        res = summarizeBordereauRows(await parseXlsx(bytes));
      } else if (/\.xls$/i.test(file.name)) {
        setBdxError('Legacy binary .xls is not supported — save the workbook as .xlsx or CSV.');
        return;
      } else {
        res = summarizeBordereau(new TextDecoder().decode(bytes));
      }
    } catch (err) {
      setBdxError(err instanceof Error ? err.message : 'Could not read the file.');
      return;
    }
    if (!res.ok) {
      setBdxError(res.errors.join(' '));
      return;
    }
    const s = res.summary;
    setForm(f => ({
      ...f,
      coverageLimit: s.coverageLimit,
      cededPremium: s.cededPremium,
      inceptionDate: s.inceptionDate || f.inceptionDate,
      expiryDate: s.expiryDate || f.expiryDate,
      lineOfBusiness: s.lineOfBusiness || f.lineOfBusiness,
      jurisdiction: s.jurisdiction || f.jurisdiction,
    }));
    setBdx({ policyCount: s.policyCount, warnings: s.warnings });
    await onPickFile(file); // pin the bordereau as the on-chain document
  };

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

      <div className="mb-3 rounded-lg border border-dashed border-gray-300 bg-white p-3">
        <label className="text-[11px] font-medium text-gray-600">
          Import bordereau (Excel .xlsx or CSV) — auto-fills coverage, premium, treaty dates and line/jurisdiction
          from the policy schedule, and pins the file as the on-chain document
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className={`${input} mt-1 block w-full`}
            onChange={e => onImportBordereau(e.target.files?.[0])}
            disabled={pin.kind === 'pinning'}
          />
        </label>
        {bdxError && <p className="mt-1 text-[11px] text-red-700">Bordereau: {bdxError}</p>}
        {bdx && (
          <div className="mt-1 text-[11px] text-emerald-700">
            Parsed {bdx.policyCount} policy row(s) → aggregate filled below; review before submitting.
            {bdx.warnings.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-amber-700">
                {bdx.warnings.map(w => <li key={w}>{w}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

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
        <div className="md:col-span-2">
          <label className="text-[11px] text-gray-500">
            Portfolio document (SOV / treaty / bordereau) — pinned to IPFS; its keccak256 becomes the on-chain documentHash
            <input
              type="file"
              className={`${input} mt-1 block w-full`}
              onChange={e => onPickFile(e.target.files?.[0])}
              disabled={pin.kind === 'pinning'}
            />
          </label>
          {pin.kind === 'pinning' && <p className="mt-1 text-[11px] text-gray-500">Sign to pin — uploading to IPFS…</p>}
          {pin.kind === 'done' && (
            <p className="mt-1 break-all text-[11px] text-emerald-700">
              Pinned ✓ {form.metadataURI} — documentHash {form.pinnedDocumentHash?.slice(0, 10)}…
            </p>
          )}
          {pin.kind === 'error' && <p className="mt-1 text-[11px] text-red-700">Pin failed: {pin.msg}</p>}
        </div>
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
