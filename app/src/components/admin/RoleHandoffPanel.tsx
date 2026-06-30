'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useProtocolAccess } from '@/hooks/useProtocolAccess';
import { useAddresses } from '@/hooks/useAddresses';
import { isDeployed } from '@/config/contracts';
import { useRoleStatus, useGrantRole } from '@/hooks/useRoleAdmin';
import {
  GRANTABLE_ROLES,
  grantableRoleByKey,
  defaultRoleKeyForApplicant,
  isValidAddress,
  evaluateGrant,
  buildGrantRoleCalldata,
  buildSafeGrantRolePayload,
} from '@/lib/roles/handoff';
import { operatorAuthMessage, type KybStatus } from '@/lib/kyb/schema';
import { DataSourceBadge } from '@/components/shared/DataSourceBadge';

/**
 * KYB -> on-chain role handoff panel (staging pilot operator tooling).
 *
 * Bridges a KYB-approved applicant to the operational ProtocolRoles role that
 * approval implies. Hybrid model:
 *  - direct wagmi grantRole when the connected wallet holds OWNER_ROLE, OR
 *  - copy Safe/Timelock-ready calldata for the post-handover world.
 * Manual operator role selection covers actors not encoded by KYB applicant_type.
 *
 * This is NOT Governance Stage A: no ownership transfer, no deployer revocation,
 * no Safe handover. OWNER_ROLE / DEFAULT_ADMIN_ROLE / VAULT_FACTORY_ROLE are not
 * grantable here. Approval never auto-grants; every grant is an explicit act.
 */

interface ApprovedApp {
  id: string;
  applicant_type: 'cedant' | 'curator';
  wallet_address: string;
  company_name: string;
  status: KybStatus;
}

type Access = ReturnType<typeof useProtocolAccess>;
type Writer = ReturnType<typeof useGrantRole>;

type QueueState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'denied'; error: string }
  | { kind: 'ready'; apps: ApprovedApp[] };

export function RoleHandoffPanel() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const access = useProtocolAccess();
  const { protocolRoles } = useAddresses();
  const deployed = isDeployed(protocolRoles);

  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const writer = useGrantRole();

  const [queue, setQueue] = useState<QueueState>({ kind: 'idle' });

  const loadQueue = useCallback(async () => {
    if (!address) return;
    setQueue({ kind: 'loading' });
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await signMessageAsync({ message: operatorAuthMessage('list', timestamp) });
      const res = await fetch('/api/kyb/applications', {
        headers: {
          'x-kyb-address': address,
          'x-kyb-timestamp': String(timestamp),
          'x-kyb-signature': signature,
        },
      });
      if (res.status === 503) {
        setQueue({ kind: 'unavailable' });
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQueue({ kind: 'denied', error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}` });
        return;
      }
      const apps: ApprovedApp[] = (data.applications ?? []).filter((a: ApprovedApp) => a.status === 'approved');
      setQueue({ kind: 'ready', apps });
    } catch {
      setQueue({ kind: 'idle' });
    }
  }, [address, signMessageAsync]);

  if (!deployed) {
    return (
      <Card>
        <Header />
        <p className="mt-3 text-xs text-red-700">
          ProtocolRoles is not deployed on this network. No role handoff is possible by design.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <Header />
      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <strong>Staging operator tooling.</strong> Direct grants use your wallet&apos;s on-chain
        OWNER_ROLE. This is <strong>not</strong> Governance Stage A: no Safe ownership transfer, no
        deployer revocation, no mainnet handover. Approval never auto-grants a role.
      </div>

      {!isConnected && (
        <p className="text-xs text-gray-400">Connect a wallet to grant roles or copy Safe calldata.</p>
      )}

      {isConnected && (
        <>
          <AuthorityNote access={access} />

          {/* Manual entry: any wallet + role, e.g. committee / sentinel / asset manager. */}
          <ManualGrantCard
            access={access}
            writer={writer}
            pendingKey={pendingKey}
            setPendingKey={setPendingKey}
            protocolRoles={protocolRoles}
          />

          {/* KYB-approved applicants. */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700">KYB-approved applicants</p>
              {queue.kind === 'ready' ? (
                <button type="button" onClick={loadQueue} className="text-xs font-medium text-blue-700 hover:text-blue-900">
                  Refresh
                </button>
              ) : (
                <button
                  type="button"
                  onClick={loadQueue}
                  disabled={queue.kind === 'loading'}
                  className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {queue.kind === 'loading' ? 'Sign & loading...' : 'Sign to load approved applicants'}
                </button>
              )}
            </div>

            {queue.kind === 'unavailable' && (
              <p className="text-xs text-red-700">KYB backend unavailable. No applicants shown by design.</p>
            )}
            {queue.kind === 'denied' && <p className="text-xs text-red-700">Access denied: {queue.error}</p>}
            {queue.kind === 'ready' && queue.apps.length === 0 && (
              <p className="text-xs text-gray-400">No KYB-approved applicants on record.</p>
            )}
            {queue.kind === 'ready' &&
              queue.apps.map(app => (
                <GrantRow
                  key={app.id}
                  app={app}
                  access={access}
                  writer={writer}
                  pendingKey={pendingKey}
                  setPendingKey={setPendingKey}
                  protocolRoles={protocolRoles}
                />
              ))}
          </div>
        </>
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
      <h3 className="text-sm font-semibold text-gray-900">Role Handoff (KYB → on-chain)</h3>
      <DataSourceBadge source="onchain" title="Role membership read from ProtocolRoles" />
    </div>
  );
}

function AuthorityNote({ access }: { access: Access }) {
  if (access.isOwner) {
    return (
      <p className="mb-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">
        Connected wallet holds OWNER_ROLE — direct staging grants are enabled.
      </p>
    );
  }
  return (
    <p className="mb-3 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
      Connected wallet does not hold OWNER_ROLE. Direct grants are disabled; copy the Safe-ready
      calldata below to execute through the protocol Safe/Timelock instead.
    </p>
  );
}

function ManualGrantCard({
  access,
  writer,
  pendingKey,
  setPendingKey,
  protocolRoles,
}: {
  access: Access;
  writer: Writer;
  pendingKey: string | null;
  setPendingKey: (k: string | null) => void;
  protocolRoles: `0x${string}`;
}) {
  const [wallet, setWallet] = useState('');
  const [roleKey, setRoleKey] = useState('');

  return (
    <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
      <p className="mb-2 text-xs font-semibold text-gray-700">Grant a role to any wallet</p>
      <input
        value={wallet}
        onChange={e => setWallet(e.target.value.trim())}
        placeholder="Target wallet (0x...)"
        className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
      />
      {wallet.length > 0 && !isValidAddress(wallet) && (
        <p className="mb-2 text-xs text-red-700">Enter a valid 0x EVM address.</p>
      )}
      <GrantControls
        account={wallet}
        roleKey={roleKey}
        onRoleKey={setRoleKey}
        noDefaultLabel={null}
        access={access}
        writer={writer}
        pendingKey={pendingKey}
        setPendingKey={setPendingKey}
        protocolRoles={protocolRoles}
      />
    </div>
  );
}

function GrantRow({
  app,
  access,
  writer,
  pendingKey,
  setPendingKey,
  protocolRoles,
}: {
  app: ApprovedApp;
  access: Access;
  writer: Writer;
  pendingKey: string | null;
  setPendingKey: (k: string | null) => void;
  protocolRoles: `0x${string}`;
}) {
  const defaultKey = defaultRoleKeyForApplicant(app.applicant_type);
  const [roleKey, setRoleKey] = useState(defaultKey ?? '');

  return (
    <div className="mb-2 rounded-lg border border-gray-100 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">{app.company_name}</span>
        <span className="text-xs text-gray-400">
          {app.applicant_type} · <code>{app.wallet_address.slice(0, 6)}...{app.wallet_address.slice(-4)}</code>
        </span>
      </div>
      {defaultKey === null && roleKey === '' && (
        <p className="mb-2 text-xs text-purple-700">
          No default role maps from this applicant type — select one manually.
        </p>
      )}
      <GrantControls
        account={app.wallet_address}
        roleKey={roleKey}
        onRoleKey={setRoleKey}
        noDefaultLabel={defaultKey}
        access={access}
        writer={writer}
        pendingKey={pendingKey}
        setPendingKey={setPendingKey}
        protocolRoles={protocolRoles}
      />
    </div>
  );
}

/**
 * Shared status + grant + preview controls for one (wallet, role) pair.
 * Reads live on-chain status, evaluates readiness, offers the direct grant
 * (OWNER only) and always renders the Safe-ready calldata.
 */
function GrantControls({
  account,
  roleKey,
  onRoleKey,
  access,
  writer,
  pendingKey,
  setPendingKey,
  protocolRoles,
}: {
  account: string;
  roleKey: string;
  onRoleKey: (k: string) => void;
  noDefaultLabel: string | null;
  access: Access;
  writer: Writer;
  pendingKey: string | null;
  setPendingKey: (k: string | null) => void;
  protocolRoles: `0x${string}`;
}) {
  const role = grantableRoleByKey(roleKey);
  const status = useRoleStatus(account, role?.id);
  const validAccount = isValidAddress(account);
  const myKey = `${account.toLowerCase()}:${roleKey}`;
  const isActive = pendingKey === myKey;

  const readiness = evaluateGrant({
    account,
    roleId: role?.id,
    alreadyHasRole: status.hasRole === true,
  });

  const writerBusy = writer.isPending || writer.isConfirming;
  const canGrant = access.isOwner && readiness === 'ready' && !writer.isWrongChain && !writerBusy;

  // Refetch this row's on-chain status once its grant confirms.
  useEffect(() => {
    if (isActive && writer.isSuccess) status.refetch();
  }, [isActive, writer.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const onGrant = () => {
    if (!role || !validAccount) return;
    setPendingKey(myKey);
    writer.grantRole(role.id, account as `0x${string}`);
  };

  const calldata = role && validAccount ? buildGrantRoleCalldata(role.id, account as `0x${string}`) : null;
  const safe = role && validAccount ? buildSafeGrantRolePayload(protocolRoles, role.id, account as `0x${string}`) : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={roleKey}
          onChange={e => onRoleKey(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
        >
          <option value="">Select role…</option>
          {GRANTABLE_ROLES.map(r => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>

        {/* Live on-chain status chips */}
        {validAccount && role && (
          <>
            {status.hasRole === undefined ? (
              <Chip text="Role: …" bg="#F3F4F6" color="#4B5563" />
            ) : status.hasRole ? (
              <Chip text="Role: granted" bg="#F0FDF4" color="#166534" />
            ) : (
              <Chip text="Role: not granted" bg="#FEF2F2" color="#B91C1C" />
            )}
            {status.complianceDeployed && (
              status.canReceive === undefined ? (
                <Chip text="Whitelist: …" bg="#F3F4F6" color="#4B5563" />
              ) : status.canReceive ? (
                <Chip text="Whitelist: yes" bg="#EFF6FF" color="#1D4ED8" />
              ) : (
                <Chip text="Whitelist: no" bg="#FFF7ED" color="#C2410C" />
              )
            )}
          </>
        )}
      </div>

      {role && <p className="text-xs text-gray-500">{role.description}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onGrant}
          disabled={!canGrant}
          title={!access.isOwner ? 'Connected wallet lacks OWNER_ROLE' : undefined}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
        >
          {isActive && writer.isPending
            ? 'Confirm in wallet…'
            : isActive && writer.isConfirming
            ? 'Confirming…'
            : 'Grant role (staging)'}
        </button>

        {/* Inline readiness / authority messaging */}
        {!validAccount && <span className="text-xs text-gray-400">Enter a valid wallet.</span>}
        {validAccount && readiness === 'no-role' && <span className="text-xs text-gray-400">Select a role.</span>}
        {validAccount && readiness === 'already-granted' && (
          <span className="text-xs text-emerald-700">Already granted — no action needed.</span>
        )}
        {validAccount && readiness === 'ready' && !access.isOwner && (
          <span className="text-xs text-gray-500">No OWNER_ROLE — use the Safe calldata below.</span>
        )}
        {writer.isWrongChain && <span className="text-xs text-amber-700">Switch to Base Sepolia (84532).</span>}
      </div>

      {/* Per-target transaction outcome */}
      {isActive && writer.isSuccess && (
        <div className="flex items-center gap-2 text-xs text-emerald-700">
          <span>Role grant confirmed on-chain.</span>
          <button
            type="button"
            onClick={() => {
              writer.reset();
              setPendingKey(null);
            }}
            className="font-medium text-blue-700 hover:text-blue-900"
          >
            Clear
          </button>
        </div>
      )}
      {isActive && writer.error && <p className="text-xs text-red-700">{writer.error}</p>}

      {/* Safe-ready calldata (always available; the only path for non-owners) */}
      {calldata && safe && (
        <details className="rounded-lg bg-gray-50 p-2 text-xs">
          <summary className="cursor-pointer font-semibold text-gray-700">
            Safe / Timelock calldata (post-handover route)
          </summary>
          <p className="mt-1 break-all font-mono text-gray-700">to: {safe.to}</p>
          <p className="break-all font-mono text-gray-700">value: {safe.value}</p>
          <p className="break-all font-mono text-gray-700">data: {calldata}</p>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(calldata)}
            className="mt-1 font-medium text-blue-700 hover:text-blue-900"
          >
            Copy calldata
          </button>
        </details>
      )}
    </div>
  );
}

function Chip({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: bg, color }}>
      {text}
    </span>
  );
}
