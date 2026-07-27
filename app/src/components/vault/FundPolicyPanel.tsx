'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { INSURANCE_VAULT_ABI, MOCK_USDC_ABI } from '@/config/contracts';
import { useAddresses } from '@/hooks/useAddresses';
import { useAllPolicies, usePolicyCount } from '@/hooks/usePolicyRegistry';
import { formatUSDC } from '@/lib/formatting';

/**
 * Funding a policy, as one action.
 *
 * It used to be two buttons the curator had to press in the right order —
 * "1. Approve USDC", then "2. Deposit Premium" — plus a free-text policy id.
 * Ordering the interface already knows is ordering the interface should carry:
 * the single button below approves only when the allowance is short, then
 * deposits on its own once the approval confirms. No address is typed anywhere.
 *
 * The policy list is restricted to policies already in THIS vault, because
 * `depositPremium` reverts with `InsuranceVault__PolicyNotInVault` for anything
 * else — offering the whole registry was offering failures.
 */

interface FundablePolicy {
  id: bigint;
  name: string;
  coverageAmount: bigint;
  premiumAmount: bigint;
}

function parseUSDC(value: string): bigint {
  const n = parseFloat(value);
  if (isNaN(n) || n <= 0) return 0n;
  return BigInt(Math.round(n * 1_000_000));
}

export function FundPolicyPanel({
  vaultAddress,
  vaultPolicyIds,
  onDone,
}: {
  vaultAddress: `0x${string}`;
  vaultPolicyIds: bigint[];
  onDone: () => void;
}) {
  const addresses = useAddresses();
  const { address } = useAccount();

  const {
    writeContract: approveWrite,
    data: approveHash,
    isPending: approvePending,
    error: approveError,
  } = useWriteContract();
  const {
    writeContract: depositWrite,
    data: depositHash,
    isPending: depositPending,
    error: depositError,
  } = useWriteContract();

  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isSuccess: depositSuccess } = useWaitForTransactionReceipt({ hash: depositHash });

  const [policyId, setPolicyId] = useState('');
  const [amount, setAmount] = useState('');
  const depositedFor = useRef<string | null>(null);
  const refreshedFor = useRef<string | null>(null);

  const { data: count } = usePolicyCount();
  const { data: policiesData } = useAllPolicies(count);

  const inVault = useMemo(
    () => new Set(vaultPolicyIds.map((id) => id.toString())),
    [vaultPolicyIds],
  );

  const fundable = useMemo<FundablePolicy[]>(() => {
    if (!policiesData) return [];
    return policiesData
      .filter((r) => r.status === 'success' && r.result)
      .map((r) => r.result as FundablePolicy)
      .filter((p) => inVault.has(p.id.toString()));
  }, [policiesData, inVault]);

  const chosen = policyId || (fundable[0]?.id.toString() ?? '');
  const selected = fundable.find((p) => p.id.toString() === chosen);
  const parsed = parseUSDC(amount);

  const { data: usdcBalance } = useReadContract({
    address: addresses.mockUSDC,
    abi: MOCK_USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: addresses.mockUSDC,
    abi: MOCK_USDC_ABI,
    functionName: 'allowance',
    args: address ? [address, vaultAddress] : undefined,
    query: { enabled: !!address },
  });

  const allowance = typeof allowanceRaw === 'bigint' ? allowanceRaw : 0n;
  const balance = typeof usdcBalance === 'bigint' ? usdcBalance : 0n;
  const needsApproval = parsed > 0n && allowance < parsed;
  const notEnough = parsed > 0n && parsed > balance;
  const busy = approvePending || depositPending;
  const error = depositError ?? approveError;

  // Second leg of the sequence. Sending a transaction is a side effect, not a
  // render-phase state write; the ref makes it fire exactly once per approval.
  useEffect(() => {
    if (!approveSuccess || !approveHash || !chosen || parsed <= 0n) return;
    if (depositedFor.current === approveHash) return;
    depositedFor.current = approveHash;
    void refetchAllowance();
    depositWrite({
      address: vaultAddress,
      abi: INSURANCE_VAULT_ABI,
      functionName: 'depositPremium',
      args: [BigInt(chosen), parsed],
    });
  }, [approveSuccess, approveHash, chosen, parsed, vaultAddress, depositWrite, refetchAllowance]);

  useEffect(() => {
    if (!depositSuccess || !depositHash) return;
    if (refreshedFor.current === depositHash) return;
    refreshedFor.current = depositHash;
    onDone();
  }, [depositSuccess, depositHash, onDone]);

  function fund() {
    if (!chosen || parsed <= 0n) return;
    if (needsApproval) {
      depositedFor.current = null;
      approveWrite({
        address: addresses.mockUSDC,
        abi: MOCK_USDC_ABI,
        functionName: 'approve',
        args: [vaultAddress, parsed],
      });
      return;
    }
    depositWrite({
      address: vaultAddress,
      abi: INSURANCE_VAULT_ABI,
      functionName: 'depositPremium',
      args: [BigInt(chosen), parsed],
    });
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: '#6B7280',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: '6px',
    fontFamily: "'Inter', sans-serif",
  };

  if (fundable.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No policy in this vault can be funded yet. Add an active policy to the vault first, then
        return here.
      </p>
    );
  }

  const disabled = busy || !chosen || parsed <= 0n || notEnough;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Final step.</strong> Fund a policy held by this vault. The premium enters as
        unearned (UPR) and is recognised over the coverage period — it is not yield on arrival.
      </div>

      <div>
        <label style={labelStyle}>Policy to fund</label>
        <div className="space-y-2">
          {fundable.map((p) => {
            const value = p.id.toString();
            const isActive = chosen === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setPolicyId(value)}
                aria-pressed={isActive}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: isActive ? '1.5px solid #1B3A6B' : '1px solid rgba(0,0,0,0.08)',
                  background: isActive ? 'rgba(27,58,107,0.05)' : '#fff',
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0F1218' }}>
                  {p.name}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: '#6B7280' }}>
                  Policy #{value} · cover {formatUSDC(p.coverageAmount)} · premium due{' '}
                  {formatUSDC(p.premiumAmount)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label style={labelStyle}>Amount (USDC)</label>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="0.000001"
            placeholder="e.g. 5000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              border: '1px solid rgba(0,0,0,0.12)',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: "'Inter', sans-serif",
              color: '#1a1a1a',
              background: '#FAFAF8',
              outline: 'none',
            }}
          />
          {selected && (
            <button
              type="button"
              onClick={() => setAmount((Number(selected.premiumAmount) / 1e6).toString())}
              className="shrink-0 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              Full premium
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Your USDC balance: <strong className="font-mono">{formatUSDC(balance)}</strong>
          {needsApproval &&
            ' · an approval is requested first, then the deposit follows on its own'}
        </p>
        {notEnough && <p className="mt-1 text-xs text-red-600">More than your USDC balance.</p>}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.message.slice(0, 200)}
        </div>
      )}

      <button
        type="button"
        onClick={fund}
        disabled={disabled}
        style={{
          background: '#1B3A6B',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          padding: '12px 28px',
          fontSize: '14px',
          fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.7 : 1,
        }}
      >
        {approvePending
          ? 'Approving USDC…'
          : depositPending
            ? 'Depositing premium…'
            : parsed <= 0n
              ? 'Enter an amount'
              : `Fund ${formatUSDC(parsed)}`}
      </button>

      {depositSuccess && (
        <p className="text-sm font-medium text-emerald-700">Premium deposited and now accruing.</p>
      )}
    </div>
  );
}
