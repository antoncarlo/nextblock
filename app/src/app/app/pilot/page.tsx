'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  useAccount,
  useChainId,
  useBalance,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { useProtocolAccess } from '@/hooks/useProtocolAccess';
import { useAddresses } from '@/hooks/useAddresses';
import { useUSDCBalance } from '@/hooks/useVaultData';
import { MOCK_USDC_ABI } from '@/config/contracts';
import { formatUSDC } from '@/lib/formatting';
import {
  PILOT_CHAIN_ID,
  FAUCET_USDC_AMOUNT_6,
  ETH_FAUCET_LINKS,
  ROLE_TRACKS,
  VIEWER_TRACK,
  deriveActiveTracks,
  nextAction,
  computeChecklist,
  NO_ROLES,
  type KybState,
  type RoleFlags,
  type ChecklistState,
  type NextActionSeverity,
} from '@/lib/pilot/status';

/**
 * Pilot Onboarding Hub (/app/pilot) — Base Sepolia testnet only.
 *
 * A read-only self-service diagnostic: it composes wallet/chain/balance, KYB
 * status and on-chain role reads, then tells each pilot user what is ready,
 * what is missing and what to do next. The only write is the test-USDC faucet
 * (MockUSDC.mint, permissionless, test-only). No real funds, no mainnet, no
 * Governance Stage A.
 */
export default function PilotHubPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const access = useProtocolAccess();
  const { mockUSDC } = useAddresses();

  const { data: ethBal } = useBalance({ address, query: { enabled: isConnected } });
  const { data: usdcBal, refetch: refetchUsdc } = useUSDCBalance(address);

  // KYB status (public, no PII) for the connected wallet. Fetched async only;
  // when disconnected we derive 'loading' below without a synchronous setState.
  const [kybFetched, setKybFetched] = useState<KybState>('loading');
  useEffect(() => {
    if (!isConnected || !address) return;
    let cancelled = false;
    (async () => {
      setKybFetched('loading');
      try {
        const res = await fetch(`/api/kyb/applications/status?wallet=${address}`);
        if (res.status === 503) {
          if (!cancelled) setKybFetched('unavailable');
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!data.available) {
          setKybFetched('unavailable');
          return;
        }
        const apps = data.applications ?? [];
        setKybFetched(apps.length === 0 ? 'none' : ((apps[0].status as KybState) ?? 'none'));
      } catch {
        if (!cancelled) setKybFetched('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  const kyb: KybState = isConnected ? kybFetched : 'loading';

  const roles: RoleFlags = isConnected
    ? {
        isOwner: access.isOwner,
        isCurator: access.isCurator,
        isCedant: access.isCedant,
        isCommittee: access.isCommittee,
        isSentinel: access.isSentinel,
        isAllocator: access.isAllocator,
      }
    : NO_ROLES;

  const input = {
    walletConnected: isConnected,
    chainId: isConnected ? chainId : undefined,
    ethWei: isConnected ? ethBal?.value : undefined,
    usdc6: isConnected ? (usdcBal as bigint | undefined) : undefined,
    kyb,
    roles,
    rolesResolved: access.status === 'onchain',
  };

  const checklist = computeChecklist(input);
  const action = nextAction(input);
  const tracks = deriveActiveTracks(roles);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">Pilot Onboarding Hub</h1>
      <p className="mt-1 text-sm text-gray-500">
        Your self-service checklist for the NextBlock testnet pilot. It shows what is ready,
        what is missing, and the single next action for your role.
      </p>

      {/* Testnet disclaimer */}
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <strong>Base Sepolia testnet only.</strong> No real funds. Test tokens (including
        MockUSDC) have no value. This is not mainnet and not a production-readiness signal. Do not
        send mainnet assets to any address shown here.
      </div>

      {/* Next action */}
      <NextActionCard action={action} mockUSDC={mockUSDC} chainId={chainId} onFaucet={refetchUsdc} />

      {/* Checklist */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Readiness checklist</h2>
        <ul className="space-y-2">
          {checklist.map(item => (
            <li key={item.key} className="flex items-start gap-3">
              <StateDot state={item.state} />
              <div>
                <p className="text-sm font-medium text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-500">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        {address && (
          <p className="mt-3 break-all text-xs text-gray-400">
            Connected wallet: <code>{address}</code>
          </p>
        )}
      </section>

      {/* Testnet asset guidance */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Testnet assets</h2>
        <p className="mb-3 text-xs text-gray-500">
          You need Base Sepolia ETH for gas and (for deposit/premium flows) test USDC. Balances:
          {' '}
          <strong>{ethBal ? `${Number(ethBal.formatted).toFixed(4)} ${ethBal.symbol}` : '—'}</strong>
          {' · '}
          <strong>{usdcBal !== undefined ? `${formatUSDC(usdcBal as bigint)} USDC` : '—'}</strong>
        </p>
        <div className="flex flex-col gap-2 text-xs">
          <div>
            <span className="font-medium text-gray-700">Base Sepolia ETH (gas):</span>{' '}
            {ETH_FAUCET_LINKS.map((f, i) => (
              <span key={f.url}>
                {i > 0 && ' · '}
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:text-blue-900">
                  {f.label}
                </a>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700">Test USDC (MockUSDC, test-only):</span>
            <FaucetButton mockUSDC={mockUSDC} chainId={chainId} onSuccess={refetchUsdc} />
          </div>
        </div>
      </section>

      {/* Role tracks */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">Your tracks</h2>
        <p className="mb-3 text-xs text-gray-500">
          Tracks unlock once the operator grants the matching on-chain role after KYB approval.
          The B2B demo viewer is always available, read-only.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROLE_TRACKS.map(t => {
            const unlocked = tracks.some(a => a.key === t.key);
            return <TrackCard key={t.key} label={t.label} description={t.description} route={t.route} unlocked={unlocked} />;
          })}
          <TrackCard
            label={VIEWER_TRACK.label}
            description={VIEWER_TRACK.description}
            route={VIEWER_TRACK.route}
            unlocked
          />
        </div>
      </section>

      {/* Support / blocked instruction */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
        <p className="font-semibold text-gray-700">Blocked or need a role?</p>
        <p className="mt-1">
          KYB and role grants are processed by the protocol operator. Submit KYB at{' '}
          <Link href="/app/apply" className="text-blue-700 hover:text-blue-900">/app/apply</Link>, then
          share your connected wallet address so the operator can grant your on-chain role via the
          admin role-handoff tool. Allocation and premium flows are operator-facilitated during the
          pilot.
        </p>
      </section>
    </div>
  );
}

const SEVERITY_STYLE: Record<NextActionSeverity, { bg: string; border: string; color: string }> = {
  blocked: { bg: '#FEF2F2', border: '#FECACA', color: '#B91C1C' },
  action: { bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8' },
  ready: { bg: '#F0FDF4', border: '#BBF7D0', color: '#166534' },
  info: { bg: '#F9FAFB', border: '#E5E7EB', color: '#4B5563' },
};

function NextActionCard({
  action,
  mockUSDC,
  chainId,
  onFaucet,
}: {
  action: ReturnType<typeof nextAction>;
  mockUSDC: `0x${string}`;
  chainId: number;
  onFaucet: () => void;
}) {
  const s = SEVERITY_STYLE[action.severity];
  return (
    <div className="mt-4 rounded-xl border p-4" style={{ background: s.bg, borderColor: s.border }}>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: s.color }}>
        Next action
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900">{action.message}</p>
      <div className="mt-2">
        {action.ctaRoute && (
          <Link
            href={action.ctaRoute}
            className="inline-block rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
          >
            {action.ctaLabel ?? 'Continue'}
          </Link>
        )}
        {action.ctaUrl && (
          <a
            href={action.ctaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
          >
            {action.ctaLabel ?? 'Open'}
          </a>
        )}
        {action.ctaLabel === 'Mint test USDC' && !action.ctaRoute && !action.ctaUrl && (
          <FaucetButton mockUSDC={mockUSDC} chainId={chainId} onSuccess={onFaucet} />
        )}
      </div>
    </div>
  );
}

/** Test-only MockUSDC faucet (permissionless mint), chain-guarded to 84532. */
function FaucetButton({
  mockUSDC,
  chainId,
  onSuccess,
}: {
  mockUSDC: `0x${string}`;
  chainId: number;
  onSuccess?: () => void;
}) {
  const { address } = useAccount();
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const wrongChain = chainId !== PILOT_CHAIN_ID;

  useEffect(() => {
    if (isSuccess) onSuccess?.();
  }, [isSuccess, onSuccess]);

  const mint = useCallback(() => {
    if (!address || wrongChain) return;
    writeContract({
      address: mockUSDC,
      abi: MOCK_USDC_ABI,
      functionName: 'mint',
      args: [address, FAUCET_USDC_AMOUNT_6],
    });
  }, [address, wrongChain, writeContract, mockUSDC]);

  return (
    <button
      type="button"
      onClick={mint}
      disabled={!address || wrongChain || isPending || isConfirming}
      title={wrongChain ? 'Switch to Base Sepolia (84532)' : undefined}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50"
    >
      {isPending || isConfirming ? 'Minting…' : isSuccess ? 'Minted 10,000 USDC' : 'Mint 10,000 test USDC'}
    </button>
  );
}

function TrackCard({
  label,
  description,
  route,
  unlocked,
}: {
  label: string;
  description: string;
  route: string;
  unlocked: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">{label}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={unlocked ? { background: '#F0FDF4', color: '#166534' } : { background: '#F3F4F6', color: '#6B7280' }}
        >
          {unlocked ? 'Unlocked' : 'Locked'}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
      {unlocked ? (
        <Link href={route} className="mt-2 inline-block text-xs font-medium text-blue-700 hover:text-blue-900">
          Open →
        </Link>
      ) : (
        <span className="mt-2 inline-block text-xs text-gray-400">Requires on-chain role</span>
      )}
    </div>
  );
}

const DOT_COLOR: Record<ChecklistState, string> = {
  ok: '#16A34A',
  todo: '#DC2626',
  pending: '#D97706',
  loading: '#9CA3AF',
  na: '#D1D5DB',
};

function StateDot({ state }: { state: ChecklistState }) {
  return (
    <span
      aria-hidden
      className="mt-1 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
      style={{ background: DOT_COLOR[state] }}
    />
  );
}
