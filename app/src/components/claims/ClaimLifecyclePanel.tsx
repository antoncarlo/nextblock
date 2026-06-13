'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { keccak256, stringToHex, parseUnits } from 'viem';
import { useProtocolAccess } from '@/hooks/useProtocolAccess';
import {
  useAllClaims,
  ClaimType,
  ClaimStatus,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_COLOR,
  formatUsdc,
  type ClaimView,
} from '@/hooks/useClaimLifecycle';
import { useClaimActions } from '@/hooks/useClaimActions';
import { DataSourceBadge } from '@/components/shared/DataSourceBadge';

/**
 * Claim lifecycle panel: the institutional separation of powers rendered as a
 * role-aware queue. The connected wallet only sees the actions its on-chain
 * role can perform (cedant submit; sentinel dispute/freeze; committee
 * resolve/approve/reject; anyone attach assessment and execute payout). All
 * data comes from the canonical NextBlockLens read model; nothing privileged
 * is reachable from this UI without the corresponding on-chain role.
 */
export function ClaimLifecyclePanel() {
  const { isConnected } = useAccount();
  const access = useProtocolAccess();
  const { lensDeployed, claims, isLoading, count, refetch } = useAllClaims();
  const actions = useClaimActions(() => refetch());

  if (!lensDeployed) {
    return (
      <Card>
        <Header />
        <p className="mt-3 text-xs text-red-700">
          NextBlockLens not deployed on this network. No claim data is shown by design.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <Header />
      <p className="mb-4 text-xs text-gray-500">
        Submitted to Paid follows the on-chain ClaimManager: AI assessment is advisory only,
        the Sentinel may dispute or freeze, and the Claims Committee is the sole approval
        authority. The vault is the only payout executor.
      </p>

      {actions.isWrongChain && (
        <div className="mb-3 rounded-lg bg-amber-50 p-3 text-xs font-medium text-amber-800">
          Please switch to Base Sepolia (chain 84532) to act on claims.
        </div>
      )}
      {actions.error && (
        <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{actions.error}</div>
      )}
      {actions.isSuccess && (
        <div className="mb-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">
          Transaction confirmed.
        </div>
      )}

      {access.isCedant && <SubmitClaimForm actions={actions} />}

      {!isConnected && (
        <p className="text-xs text-gray-400">Connect a wallet to view and act on claims.</p>
      )}

      {isConnected && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-gray-500">{count} claim(s) on record</p>
          {isLoading && claims.length === 0 && (
            <p className="text-xs text-gray-400">Loading claims...</p>
          )}
          {!isLoading && claims.length === 0 && (
            <p className="text-xs text-gray-400">No claims submitted yet.</p>
          )}
          {claims.map(c => (
            <ClaimRow key={c.claimId.toString()} claim={c} access={access} actions={actions} />
          ))}
        </div>
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
      <h3 className="text-sm font-semibold text-gray-900">Claim Lifecycle</h3>
      <DataSourceBadge source="onchain" title="Claims read from NextBlockLens" />
    </div>
  );
}

type Actions = ReturnType<typeof useClaimActions>;
type Access = ReturnType<typeof useProtocolAccess>;

function SubmitClaimForm({ actions }: { actions: Actions }) {
  const [vault, setVault] = useState('');
  const [portfolioId, setPortfolioId] = useState('');
  const [amount, setAmount] = useState('');
  const [claimType, setClaimType] = useState<ClaimType>(ClaimType.NON_PARAMETRIC);
  const [evidence, setEvidence] = useState('');

  const evmAddress = /^0x[0-9a-fA-F]{40}$/;
  const valid =
    evmAddress.test(vault) && portfolioId.trim() !== '' && Number(amount) > 0 && evidence.trim() !== '';

  const submit = () => {
    if (!valid) return;
    const evidenceHash = keccak256(stringToHex(evidence.trim()));
    actions.submitClaim(
      vault as `0x${string}`,
      BigInt(portfolioId),
      parseUnits(amount, 6),
      claimType,
      evidenceHash,
    );
  };

  const pending = actions.isPending || actions.isConfirming;

  return (
    <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
      <p className="mb-3 text-xs font-semibold text-gray-700">Submit a claim (Cedant)</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <input
          value={vault}
          onChange={e => setVault(e.target.value)}
          placeholder="Vault address 0x..."
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs"
        />
        <input
          value={portfolioId}
          onChange={e => setPortfolioId(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="Portfolio id"
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs"
        />
        <input
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Requested amount (USDC)"
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs"
        />
        <select
          value={claimType}
          onChange={e => setClaimType(Number(e.target.value) as ClaimType)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs"
        >
          <option value={ClaimType.NON_PARAMETRIC}>Non-parametric (AI gate + dispute window)</option>
          <option value={ClaimType.PARAMETRIC}>Parametric (objective trigger)</option>
        </select>
        <input
          value={evidence}
          onChange={e => setEvidence(e.target.value)}
          placeholder="Evidence reference (hashed on submit)"
          className="md:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-xs"
        />
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!valid || pending}
        className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
      >
        {pending ? 'Submitting...' : 'Submit claim'}
      </button>
    </div>
  );
}

function ClaimRow({ claim, access, actions }: { claim: ClaimView; access: Access; actions: Actions }) {
  const [reason, setReason] = useState('');
  const [approveAmount, setApproveAmount] = useState('');
  const sc = CLAIM_STATUS_COLOR[claim.status];
  const pending = actions.isPending || actions.isConfirming;

  const canAttach = claim.status === ClaimStatus.SUBMITTED && claim.hasAssessment;
  const canExecute = claim.status === ClaimStatus.APPROVED;
  const committeeCanApprove =
    access.isCommittee &&
    !claim.frozen &&
    (claim.claimType === ClaimType.PARAMETRIC
      ? claim.status === ClaimStatus.SUBMITTED || claim.status === ClaimStatus.ASSESSED
      : claim.status === ClaimStatus.ASSESSED && claim.disputeWindowElapsed);
  const committeeCanReject =
    access.isCommittee && claim.status !== ClaimStatus.PAID && claim.status !== ClaimStatus.REJECTED;
  const sentinelCanDispute =
    access.isSentinel && (claim.status === ClaimStatus.SUBMITTED || claim.status === ClaimStatus.ASSESSED);

  return (
    <div className="rounded-lg border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-gray-900">Claim #{claim.claimId.toString()}</span>
          <span className="ml-2 text-xs text-gray-400">
            portfolio {claim.portfolioId.toString()} ·{' '}
            {claim.claimType === ClaimType.PARAMETRIC ? 'parametric' : 'non-parametric'}
          </span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{ background: sc.bg, color: sc.color }}
        >
          {CLAIM_STATUS_LABEL[claim.status]}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600 md:grid-cols-3">
        <span>Requested: ${formatUsdc(claim.requestedAmount)}</span>
        <span>Approved: ${formatUsdc(claim.approvedAmount)}</span>
        <span>Dispute window: {claim.disputeWindowElapsed ? 'elapsed' : 'active'}</span>
        <span>Frozen: {claim.frozen ? 'yes' : 'no'}</span>
        <span>Assessment: {claim.hasAssessment ? `score ${claim.assessmentScoreBps}bps` : 'none'}</span>
        <span className={claim.anomalous ? 'font-semibold text-red-700' : ''}>
          Anomaly: {claim.anomalous ? 'flagged' : 'no'}
        </span>
      </div>

      {/* Permissionless lifecycle helpers */}
      <div className="mt-3 flex flex-wrap gap-2">
        {canAttach && (
          <ActionButton label="Attach assessment" onClick={() => actions.attachAssessment(claim.claimId)} disabled={pending} />
        )}
        {canExecute && (
          <ActionButton label="Execute payout" onClick={() => actions.executeClaim(claim.claimId)} disabled={pending} primary />
        )}

        {/* Sentinel */}
        {access.isSentinel && claim.status !== ClaimStatus.PAID && claim.status !== ClaimStatus.REJECTED && !claim.frozen && (
          <ActionButton label="Freeze" onClick={() => actions.freezeClaim(claim.claimId)} disabled={pending} />
        )}
        {access.isSentinel && claim.frozen && claim.status !== ClaimStatus.DISPUTED && (
          <ActionButton label="Unfreeze" onClick={() => actions.unfreezeClaim(claim.claimId)} disabled={pending} />
        )}

        {/* Committee: resolve a standing dispute */}
        {access.isCommittee && claim.status === ClaimStatus.DISPUTED && (
          <>
            <ActionButton label="Uphold dispute (reject)" onClick={() => actions.resolveDispute(claim.claimId, true)} disabled={pending} />
            <ActionButton label="Return to assessed" onClick={() => actions.resolveDispute(claim.claimId, false)} disabled={pending} />
          </>
        )}
      </div>

      {/* Sentinel dispute with reason */}
      {sentinelCanDispute && (
        <ReasonAction
          placeholder="Dispute reason"
          label="Dispute"
          value={reason}
          onChange={setReason}
          disabled={pending}
          onSubmit={() => actions.disputeClaim(claim.claimId, reason.trim() || 'sentinel dispute')}
        />
      )}

      {/* Committee approve with amount */}
      {committeeCanApprove && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={approveAmount}
            onChange={e => setApproveAmount(e.target.value)}
            placeholder={`Approved amount (<= ${formatUsdc(claim.requestedAmount)})`}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
          />
          <ActionButton
            label="Approve"
            primary
            disabled={pending || Number(approveAmount) <= 0}
            onClick={() => actions.approveClaim(claim.claimId, parseUnits(approveAmount || '0', 6))}
          />
        </div>
      )}

      {/* Committee reject with reason */}
      {committeeCanReject && (
        <ReasonAction
          placeholder="Rejection reason"
          label="Reject"
          value={reason}
          onChange={setReason}
          disabled={pending}
          onSubmit={() => actions.rejectClaim(claim.claimId, reason.trim() || 'committee rejection')}
        />
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

function ReasonAction({
  placeholder,
  label,
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  placeholder: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
      />
      <ActionButton label={label} onClick={onSubmit} disabled={disabled} />
    </div>
  );
}
