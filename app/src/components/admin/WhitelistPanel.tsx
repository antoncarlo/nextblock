'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { useAddresses } from '@/hooks/useAddresses';
import { isDeployed } from '@/config/contracts';
import { useWhitelistStatus, useSetWhitelist } from '@/hooks/useComplianceAdmin';
import {
  isValidAddress,
  evaluateWhitelist,
  buildSetWhitelistCalldata,
  buildSafeSetWhitelistPayload,
} from '@/lib/compliance/whitelist';
import { DataSourceBadge } from '@/components/shared/DataSourceBadge';

/**
 * LP Whitelist admin panel (staging pilot operator tooling).
 *
 * Toggles the ComplianceRegistry whitelist flag that gates Institutional LP
 * eligibility (canReceive). Hybrid model: direct wagmi setWhitelist when the
 * connected wallet holds KYC_OPERATOR_ROLE, otherwise a Safe-ready calldata
 * preview. Whitelisting is NEVER automatic on KYB approval — it is an explicit
 * operator action. On-chain access control (onlyProtocolRole(KYC_OPERATOR_ROLE))
 * is the real barrier; the UI only mirrors it.
 */

const REQUIRED_CHAIN_ID = 84532;

export function WhitelistPanel() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { complianceRegistry } = useAddresses();
  const deployed = isDeployed(complianceRegistry);

  const [target, setTarget] = useState('');
  const [allowed, setAllowed] = useState(true);

  const status = useWhitelistStatus(target, address);
  const writer = useSetWhitelist(() => status.refetch());

  // Re-read eligibility once the write confirms.
  useEffect(() => {
    if (writer.isSuccess) status.refetch();
  }, [writer.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const validTarget = isValidAddress(target);
  const isCorrectChain = chainId === REQUIRED_CHAIN_ID;
  const readiness = evaluateWhitelist({
    targetAddress: target,
    currentWhitelisted: status.whitelisted === true,
    allowed,
    isAuthorizedOperator: status.isAuthorizedOperator,
    isCorrectChain,
  });

  const busy = writer.isPending || writer.isConfirming;
  const canWrite = readiness === 'ready' && !busy;
  const calldata = validTarget ? buildSetWhitelistCalldata(target as `0x${string}`, allowed) : null;
  const safe = validTarget ? buildSafeSetWhitelistPayload(complianceRegistry, target as `0x${string}`, allowed) : null;

  const onWrite = useCallback(() => {
    if (!validTarget || readiness !== 'ready') return;
    writer.setWhitelist(target as `0x${string}`, allowed);
  }, [validTarget, readiness, writer, target, allowed]);

  if (!deployed) {
    return (
      <Card>
        <Header />
        <p className="mt-3 text-xs text-red-700">
          ComplianceRegistry is not deployed on this network. LP whitelisting is unavailable by design.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <Header />
      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <strong>Staging operator tooling.</strong> Direct writes use your wallet&apos;s on-chain
        KYC_OPERATOR_ROLE. Whitelisting an Institutional LP is an explicit action and is{' '}
        <strong>never automatic on KYB approval</strong>.
      </div>

      {!isConnected && (
        <p className="text-xs text-gray-400">Connect a wallet to whitelist an LP or copy Safe calldata.</p>
      )}

      {/* Connected wallet authority */}
      <p
        className="mb-3 rounded-lg p-2 text-xs"
        style={
          status.isAuthorizedOperator
            ? { background: '#F0FDF4', color: '#166534' }
            : { background: '#F9FAFB', color: '#4B5563' }
        }
      >
        {status.isAuthorizedOperator
          ? 'Connected wallet holds KYC_OPERATOR_ROLE — direct whitelist writes are enabled.'
          : 'Connected wallet does not hold KYC_OPERATOR_ROLE. Direct writes are disabled; use the Safe calldata below.'}
      </p>

      {/* Target + action */}
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
        <label className="mb-1 block text-xs font-semibold text-gray-700">Institutional LP wallet</label>
        <input
          value={target}
          onChange={e => setTarget(e.target.value.trim())}
          placeholder="Target wallet (0x...)"
          className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
        />
        {target.length > 0 && !validTarget && (
          <p className="mb-2 text-xs text-red-700">Enter a valid 0x EVM address.</p>
        )}

        {/* Context: always shown */}
        <div className="mb-3 grid grid-cols-1 gap-1 text-xs text-gray-600">
          <span>Contract: <code className="break-all">{complianceRegistry}</code></span>
          <span>Method: <code>setWhitelist(address,bool)</code></span>
          <span>Required chain: <code>84532</code> (Base Sepolia){!isCorrectChain && <span className="text-amber-700"> — wrong chain</span>}</span>
          {validTarget && (
            <span className="flex flex-wrap items-center gap-2">
              Current:
              {status.whitelisted === undefined ? (
                <Chip text="whitelist: …" bg="#F3F4F6" color="#4B5563" />
              ) : status.whitelisted ? (
                <Chip text="whitelist: true" bg="#F0FDF4" color="#166534" />
              ) : (
                <Chip text="whitelist: false" bg="#FEF2F2" color="#B91C1C" />
              )}
              {status.canReceive === undefined ? (
                <Chip text="canReceive: …" bg="#F3F4F6" color="#4B5563" />
              ) : status.canReceive ? (
                <Chip text="canReceive: yes" bg="#EFF6FF" color="#1D4ED8" />
              ) : (
                <Chip text="canReceive: no" bg="#FFF7ED" color="#C2410C" />
              )}
            </span>
          )}
        </div>

        <label className="mb-3 flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={allowed} onChange={e => setAllowed(e.target.checked)} />
          Set whitelist to <code>{String(allowed)}</code> ({allowed ? 'enable LP' : 'remove LP'})
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onWrite}
            disabled={!canWrite}
            title={!status.isAuthorizedOperator ? 'Connected wallet lacks KYC_OPERATOR_ROLE' : undefined}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
          >
            {writer.isPending
              ? 'Confirm in wallet…'
              : writer.isConfirming
              ? 'Confirming…'
              : allowed
              ? 'Whitelist LP (staging)'
              : 'Remove LP (staging)'}
          </button>

          {!validTarget && <span className="text-xs text-gray-400">Enter a valid wallet.</span>}
          {validTarget && readiness === 'wrong-chain' && (
            <span className="text-xs text-amber-700">Switch to Base Sepolia (84532).</span>
          )}
          {validTarget && readiness === 'insufficient-permission' && (
            <span className="text-xs text-gray-500">No KYC_OPERATOR_ROLE — use the Safe calldata below.</span>
          )}
          {validTarget && readiness === 'already' && (
            <span className="text-xs text-emerald-700">Already in the requested state — no action needed.</span>
          )}
        </div>

        {/* Per-action outcome */}
        {writer.isSuccess && (
          <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700">
            <span>setWhitelist confirmed on-chain.</span>
            <button type="button" onClick={writer.reset} className="font-medium text-blue-700 hover:text-blue-900">
              Clear
            </button>
          </div>
        )}
        {writer.error && <p className="mt-2 text-xs text-red-700">{writer.error}</p>}

        {/* Safe-ready calldata (always available; the only path for non-operators) */}
        {calldata && safe && (
          <details className="mt-2 rounded-lg bg-white p-2 text-xs">
            <summary className="cursor-pointer font-semibold text-gray-700">
              Safe / Timelock calldata (KYC Operator via Safe)
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
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-6">{children}</div>;
}

function Header() {
  return (
    <div className="mb-1 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-gray-900">LP Whitelist (ComplianceRegistry)</h3>
      <DataSourceBadge source="onchain" title="Whitelist read from ComplianceRegistry" />
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
