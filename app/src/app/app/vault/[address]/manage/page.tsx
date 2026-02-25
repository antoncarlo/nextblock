'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import {
  INSURANCE_VAULT_ABI,
  POLICY_REGISTRY_ABI,
  MOCK_USDC_ABI,
} from '@/config/contracts';
import { useAddresses } from '@/hooks/useAddresses';
import { useVaultInfo } from '@/hooks/useVaultData';
import { useAllPolicies, usePolicyCount } from '@/hooks/usePolicyRegistry';
import { formatUSDC } from '@/lib/formatting';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'register' | 'add' | 'premium' | 'authorize';

interface VerificationOption {
  value: number;
  label: string;
  description: string;
}

const VERIFICATION_TYPES: VerificationOption[] = [
  { value: 0, label: 'Permissionless', description: 'On-chain auto-settlement via checkClaim()' },
  { value: 1, label: 'Oracle Reporter', description: 'Settled by a trusted oracle address' },
  { value: 2, label: 'Insurer Admin', description: 'Manual settlement by the insurer admin' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseUSDC(value: string): bigint {
  const n = parseFloat(value);
  if (isNaN(n) || n <= 0) return 0n;
  return BigInt(Math.round(n * 1_000_000));
}

function parseDays(value: string): bigint {
  const n = parseInt(value, 10);
  if (isNaN(n) || n <= 0) return 0n;
  return BigInt(n * 86400);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TxStatus({
  hash,
  isPending,
  label,
}: {
  hash?: `0x${string}`;
  isPending: boolean;
  label: string;
}) {
  const { isLoading, isSuccess, isError } = useWaitForTransactionReceipt({ hash });

  if (isPending) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Waiting for wallet confirmation...
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Transaction submitted — waiting for confirmation on-chain...
      </div>
    );
  }
  if (isSuccess) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        {label} confirmed on-chain.
        {hash && (
          <a
            href={`https://sepolia.basescan.org/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 underline"
          >
            View tx
          </a>
        )}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        Transaction failed. Check your wallet and try again.
      </div>
    );
  }
  return null;
}

// ─── Tab: Register Policy ────────────────────────────────────────────────────

function RegisterPolicyTab() {
  const addresses = useAddresses();
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const [form, setForm] = useState({
    name: '',
    verificationType: 0,
    coverageAmount: '',
    premiumAmount: '',
    durationDays: '',
    insurer: '' as string,
    triggerThreshold: '0',
  });

  const { address } = useAccount();

  useEffect(() => {
    if (address && !form.insurer) {
      setForm(f => ({ ...f, insurer: address }));
    }
  }, [address, form.insurer]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    writeContract({
      address: addresses.policyRegistry,
      abi: POLICY_REGISTRY_ABI,
      functionName: 'registerPolicy',
      args: [
        form.name,
        form.verificationType,
        parseUSDC(form.coverageAmount),
        parseUSDC(form.premiumAmount),
        parseDays(form.durationDays),
        form.insurer as `0x${string}`,
        BigInt(form.triggerThreshold),
      ],
    });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: "'Inter', sans-serif",
    color: '#1a1a1a',
    background: '#FAFAF8',
    outline: 'none',
  };

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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Step 1 of 3.</strong> Register a new insurance policy in the global PolicyRegistry. After registration, you will receive a Policy ID — use it in the next step to add the policy to your vault.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label style={labelStyle}>Policy Name</label>
          <input
            style={inputStyle}
            placeholder="e.g. Cyber Liability Q1 2025"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Verification Type</label>
          <select
            style={inputStyle}
            value={form.verificationType}
            onChange={e => setForm(f => ({ ...f, verificationType: parseInt(e.target.value) }))}
          >
            {VERIFICATION_TYPES.map(v => (
              <option key={v.value} value={v.value}>{v.label} — {v.description}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Coverage Amount (USDC)</label>
          <input
            style={inputStyle}
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 100000"
            value={form.coverageAmount}
            onChange={e => setForm(f => ({ ...f, coverageAmount: e.target.value }))}
            required
          />
          <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
            Maximum payout in case of claim settlement
          </p>
        </div>

        <div>
          <label style={labelStyle}>Premium Amount (USDC)</label>
          <input
            style={inputStyle}
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 5000"
            value={form.premiumAmount}
            onChange={e => setForm(f => ({ ...f, premiumAmount: e.target.value }))}
            required
          />
          <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
            Total premium to be deposited by the insurer
          </p>
        </div>

        <div>
          <label style={labelStyle}>Duration (days)</label>
          <input
            style={inputStyle}
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 365"
            value={form.durationDays}
            onChange={e => setForm(f => ({ ...f, durationDays: e.target.value }))}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Trigger Threshold</label>
          <input
            style={inputStyle}
            type="number"
            step="1"
            placeholder="0 (permissionless) or oracle value"
            value={form.triggerThreshold}
            onChange={e => setForm(f => ({ ...f, triggerThreshold: e.target.value }))}
          />
          <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
            For oracle-verified policies: the threshold value that triggers a claim
          </p>
        </div>

        <div className="sm:col-span-2">
          <label style={labelStyle}>Insurer Address</label>
          <input
            style={inputStyle}
            placeholder="0x..."
            value={form.insurer}
            onChange={e => setForm(f => ({ ...f, insurer: e.target.value }))}
            required
          />
          <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
            The wallet address of the insurer responsible for this policy (defaults to your connected wallet)
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.message.slice(0, 200)}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        style={{
          background: '#1B3A6B',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          padding: '12px 28px',
          fontSize: '14px',
          fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? 'Confirm in wallet...' : 'Register Policy'}
      </button>

      <TxStatus hash={hash} isPending={isPending} label="Policy registered" />
    </form>
  );
}

// ─── Tab: Add Policy to Vault ────────────────────────────────────────────────

function AddPolicyTab({ vaultAddress }: { vaultAddress: `0x${string}` }) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { data: count } = usePolicyCount();
  const { data: policiesData } = useAllPolicies(count);

  const [policyId, setPolicyId] = useState('');
  const [weightBps, setWeightBps] = useState('');

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: "'Inter', sans-serif",
    color: '#1a1a1a',
    background: '#FAFAF8',
    outline: 'none',
  };

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    writeContract({
      address: vaultAddress,
      abi: INSURANCE_VAULT_ABI,
      functionName: 'addPolicy',
      args: [BigInt(policyId), BigInt(weightBps)],
    });
  }

  const totalBps = policiesData
    ? policiesData.reduce((acc, r) => {
        if (r.status !== 'success' || !r.result) return acc;
        return acc;
      }, 0)
    : 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Step 2 of 3.</strong> Add a registered policy to this vault with an allocation weight. The weight (in basis points, 10000 = 100%) determines how much of the vault capital is allocated to cover this policy. Only the vault manager can perform this action.
      </div>

      {/* Policy selector */}
      {policiesData && policiesData.length > 0 && (
        <div>
          <label style={labelStyle}>Select from registered policies</label>
          <div className="space-y-2 max-h-48 overflow-y-auto rounded-xl border border-gray-100 p-2">
            {policiesData.map((result, idx) => {
              if (result.status !== 'success' || !result.result) return null;
              const p = result.result as { id: bigint; name: string; verificationType: number; coverageAmount: bigint; premiumAmount: bigint };
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPolicyId(p.id.toString())}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: policyId === p.id.toString() ? '1.5px solid #1B3A6B' : '1px solid rgba(0,0,0,0.08)',
                    background: policyId === p.id.toString() ? 'rgba(27,58,107,0.05)' : '#fff',
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
                    #{p.id.toString()} — {p.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                    Coverage: {formatUSDC(p.coverageAmount)} · Premium: {formatUSDC(p.premiumAmount)} · Type: {VERIFICATION_TYPES[p.verificationType]?.label ?? 'Unknown'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label style={labelStyle}>Policy ID</label>
          <input
            style={inputStyle}
            type="number"
            min="0"
            step="1"
            placeholder="e.g. 0"
            value={policyId}
            onChange={e => setPolicyId(e.target.value)}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Allocation Weight (bps)</label>
          <input
            style={inputStyle}
            type="number"
            min="1"
            max="10000"
            step="1"
            placeholder="e.g. 1250 = 12.5%"
            value={weightBps}
            onChange={e => setWeightBps(e.target.value)}
            required
          />
          <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
            10000 bps = 100% of vault capital. Sum of all policy weights must not exceed 10000 minus the buffer ratio.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600">
        <strong>Buffer reminder:</strong> The vault has a buffer ratio that reserves a portion of capital as liquidity. Ensure the sum of all policy weights does not exceed <code>10000 - bufferRatioBps</code>. Check the vault detail page for the current buffer ratio.
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.message.slice(0, 200)}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !policyId || !weightBps}
        style={{
          background: '#1B3A6B',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          padding: '12px 28px',
          fontSize: '14px',
          fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
          cursor: isPending || !policyId || !weightBps ? 'not-allowed' : 'pointer',
          opacity: isPending || !policyId || !weightBps ? 0.7 : 1,
        }}
      >
        {isPending ? 'Confirm in wallet...' : 'Add Policy to Vault'}
      </button>

      <TxStatus hash={hash} isPending={isPending} label="Policy added to vault" />
    </form>
  );
}

// ─── Tab: Deposit Premium ────────────────────────────────────────────────────

function DepositPremiumTab({ vaultAddress }: { vaultAddress: `0x${string}` }) {
  const addresses = useAddresses();
  const { address } = useAccount();
  const { writeContract: approveWrite, data: approveHash, isPending: approvePending } = useWriteContract();
  const { writeContract: depositWrite, data: depositHash, isPending: depositPending, error } = useWriteContract();
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  const [policyId, setPolicyId] = useState('');
  const [amount, setAmount] = useState('');

  const { data: count } = usePolicyCount();
  const { data: policiesData } = useAllPolicies(count);

  const { data: usdcBalance } = useReadContract({
    address: addresses.mockUSDC,
    abi: MOCK_USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: "'Inter', sans-serif",
    color: '#1a1a1a',
    background: '#FAFAF8',
    outline: 'none',
  };

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

  function handleApprove() {
    approveWrite({
      address: addresses.mockUSDC,
      abi: MOCK_USDC_ABI,
      functionName: 'approve',
      args: [vaultAddress, parseUSDC(amount)],
    });
  }

  function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    depositWrite({
      address: vaultAddress,
      abi: INSURANCE_VAULT_ABI,
      functionName: 'depositPremium',
      args: [BigInt(policyId), parseUSDC(amount)],
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Step 3 of 3.</strong> Deposit the USDC premium for a policy already added to this vault. Two transactions required: (1) approve USDC spend, (2) deposit premium. The premium activates the policy and starts the coverage period.
      </div>

      {usdcBalance !== undefined && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Your USDC balance: <strong className="font-mono">{formatUSDC(usdcBalance as bigint)}</strong>
        </div>
      )}

      {policiesData && policiesData.length > 0 && (
        <div>
          <label style={labelStyle}>Select policy</label>
          <div className="space-y-2 max-h-40 overflow-y-auto rounded-xl border border-gray-100 p-2">
            {policiesData.map((result, idx) => {
              if (result.status !== 'success' || !result.result) return null;
              const p = result.result as { id: bigint; name: string; premiumAmount: bigint };
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPolicyId(p.id.toString());
                    const premiumUsdc = Number(p.premiumAmount) / 1_000_000;
                    setAmount(premiumUsdc.toString());
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: policyId === p.id.toString() ? '1.5px solid #1B3A6B' : '1px solid rgba(0,0,0,0.08)',
                    background: policyId === p.id.toString() ? 'rgba(27,58,107,0.05)' : '#fff',
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
                    #{p.id.toString()} — {p.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                    Required premium: {formatUSDC(p.premiumAmount)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <form onSubmit={handleDeposit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Policy ID</label>
            <input
              style={inputStyle}
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 0"
              value={policyId}
              onChange={e => setPolicyId(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Amount (USDC)</label>
            <input
              style={inputStyle}
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 5000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error.message.slice(0, 200)}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleApprove}
            disabled={approvePending || !amount}
            style={{
              background: approveSuccess ? '#059669' : '#6B7280',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              cursor: approvePending || !amount ? 'not-allowed' : 'pointer',
              opacity: approvePending || !amount ? 0.7 : 1,
            }}
          >
            {approvePending ? 'Approving...' : approveSuccess ? 'Approved' : '1. Approve USDC'}
          </button>

          <button
            type="submit"
            disabled={depositPending || !approveSuccess || !policyId || !amount}
            style={{
              background: '#1B3A6B',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              cursor: depositPending || !approveSuccess || !policyId || !amount ? 'not-allowed' : 'pointer',
              opacity: depositPending || !approveSuccess || !policyId || !amount ? 0.7 : 1,
            }}
          >
            {depositPending ? 'Depositing...' : '2. Deposit Premium'}
          </button>
        </div>

        <TxStatus hash={approveHash} isPending={approvePending} label="USDC approved" />
        <TxStatus hash={depositHash} isPending={depositPending} label="Premium deposited — policy is now active" />
      </form>
    </div>
  );
}

// ─── Tab: Authorize Depositor ────────────────────────────────────────────────

function AuthorizeDepositorTab({ vaultAddress }: { vaultAddress: `0x${string}` }) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const [depositorAddress, setDepositorAddress] = useState('');
  const [authorized, setAuthorized] = useState(true);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: "'Inter', sans-serif",
    color: '#1a1a1a',
    background: '#FAFAF8',
    outline: 'none',
  };

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    writeContract({
      address: vaultAddress,
      abi: INSURANCE_VAULT_ABI,
      functionName: 'setAuthorizedPremiumDepositor',
      args: [depositorAddress as `0x${string}`, authorized],
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Premium Delegation.</strong> Authorize a third-party address (e.g. a broker, a smart contract, or a delegated wallet) to deposit premiums on behalf of the insurer. This enables premium delegation without transferring vault manager rights.
      </div>

      <div>
        <label style={labelStyle}>Depositor Address</label>
        <input
          style={inputStyle}
          placeholder="0x..."
          value={depositorAddress}
          onChange={e => setDepositorAddress(e.target.value)}
          required
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setAuthorized(true)}
          style={{
            padding: '8px 20px',
            borderRadius: '8px',
            border: authorized ? '1.5px solid #059669' : '1px solid rgba(0,0,0,0.1)',
            background: authorized ? 'rgba(5,150,105,0.08)' : '#fff',
            color: authorized ? '#059669' : '#6B7280',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Authorize
        </button>
        <button
          type="button"
          onClick={() => setAuthorized(false)}
          style={{
            padding: '8px 20px',
            borderRadius: '8px',
            border: !authorized ? '1.5px solid #DC2626' : '1px solid rgba(0,0,0,0.1)',
            background: !authorized ? 'rgba(220,38,38,0.08)' : '#fff',
            color: !authorized ? '#DC2626' : '#6B7280',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Revoke
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.message.slice(0, 200)}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !depositorAddress}
        style={{
          background: '#1B3A6B',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          padding: '12px 28px',
          fontSize: '14px',
          fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
          cursor: isPending || !depositorAddress ? 'not-allowed' : 'pointer',
          opacity: isPending || !depositorAddress ? 0.7 : 1,
        }}
      >
        {isPending ? 'Confirm in wallet...' : authorized ? 'Authorize Depositor' : 'Revoke Authorization'}
      </button>

      <TxStatus hash={hash} isPending={isPending} label={authorized ? 'Depositor authorized' : 'Authorization revoked'} />
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ManageVaultPage() {
  const params = useParams();
  const vaultAddress = params.address as `0x${string}`;
  const { address, isConnected } = useAccount();

  const [activeTab, setActiveTab] = useState<Tab>('register');

  const { data: vaultInfoRaw } = useVaultInfo(vaultAddress);
  const vaultInfo = vaultInfoRaw as unknown as [string, `0x${string}`, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] | undefined;

  const vaultName = vaultInfo?.[0] ?? 'Vault';
  const vaultManager = vaultInfo?.[1];
  const bufferBps = vaultInfo?.[5] ?? 0n;
  const feeBps = vaultInfo?.[6] ?? 0n;
  const policyCount = vaultInfo?.[9] ?? 0n;

  const isManager = isConnected && address && vaultManager
    ? address.toLowerCase() === vaultManager.toLowerCase()
    : false;

  const tabs: { id: Tab; label: string; description: string }[] = [
    { id: 'register', label: '1. Register Policy', description: 'Create a new policy in the global registry' },
    { id: 'add', label: '2. Add to Vault', description: 'Allocate a registered policy to this vault' },
    { id: 'premium', label: '3. Deposit Premium', description: 'Deposit USDC premium to activate a policy' },
    { id: 'authorize', label: 'Authorize Depositor', description: 'Delegate premium deposits to another address' },
  ];

  if (!isConnected) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '80px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5" style={{ margin: '0 auto' }}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '24px', color: '#1B3A6B', marginBottom: '8px' }}>
          Connect Your Wallet
        </h2>
        <p style={{ fontSize: '14px', color: '#6B7280', fontFamily: "'Inter', sans-serif" }}>
          Connect your wallet to manage this vault.
        </p>
      </div>
    );
  }

  if (!isManager) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '80px 32px', textAlign: 'center' }}>
        <div style={{ marginBottom: '16px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.5" style={{ margin: '0 auto' }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '24px', color: '#1B3A6B', marginBottom: '8px' }}>
          Access Restricted
        </h2>
        <p style={{ fontSize: '14px', color: '#6B7280', fontFamily: "'Inter', sans-serif", marginBottom: '4px' }}>
          Only the vault manager can access this page.
        </p>
        <p style={{ fontSize: '12px', color: '#9CA3AF', fontFamily: "'Inter', sans-serif", marginBottom: '24px' }}>
          Manager: <code>{vaultManager}</code>
        </p>
        <Link
          href={`/app/vault/${vaultAddress}`}
          style={{
            display: 'inline-block',
            background: '#1B3A6B',
            color: '#fff',
            padding: '10px 24px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            textDecoration: 'none',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Back to Vault
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 32px' }}>

      {/* Breadcrumb */}
      <nav style={{ marginBottom: '24px', fontSize: '13px', fontFamily: "'Inter', sans-serif", color: '#9CA3AF' }}>
        <Link href="/app" style={{ color: '#9CA3AF', textDecoration: 'none' }}>Vaults</Link>
        <span style={{ margin: '0 8px' }}>/</span>
        <Link href={`/app/vault/${vaultAddress}`} style={{ color: '#9CA3AF', textDecoration: 'none' }}>{vaultName}</Link>
        <span style={{ margin: '0 8px' }}>/</span>
        <span style={{ color: '#1B3A6B', fontWeight: 600 }}>Manage</span>
      </nav>

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', fontWeight: 700, color: '#1B3A6B', marginBottom: '8px' }}>
          Manage {vaultName}
        </h1>
        <p style={{ fontSize: '14px', color: '#6B7280', fontFamily: "'Inter', sans-serif" }}>
          Register and activate insurance policies, deposit premiums, and manage depositor authorizations for this vault.
        </p>
      </div>

      {/* Vault summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          marginBottom: '32px',
          padding: '20px',
          background: '#F8F7F4',
          borderRadius: '12px',
          border: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>Buffer Ratio</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#1B3A6B', fontFamily: "'Inter', sans-serif", marginTop: '4px' }}>
            {(Number(bufferBps) / 100).toFixed(1)}%
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: "'Inter', sans-serif", marginTop: '2px' }}>
            Reserved as liquidity buffer
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>Management Fee</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#1B3A6B', fontFamily: "'Inter', sans-serif", marginTop: '4px' }}>
            {(Number(feeBps) / 100).toFixed(1)}%
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: "'Inter', sans-serif", marginTop: '2px' }}>
            Annual fee on AUM
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>Active Policies</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#1B3A6B', fontFamily: "'Inter', sans-serif", marginTop: '4px' }}>
            {policyCount.toString()}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: "'Inter', sans-serif", marginTop: '2px' }}>
            Policies in this vault
          </div>
        </div>
      </div>

      {/* Max allocation note */}
      <div style={{ marginBottom: '24px', padding: '14px 16px', background: 'rgba(27,58,107,0.04)', borderRadius: '10px', border: '1px solid rgba(27,58,107,0.1)', fontSize: '13px', color: '#1B3A6B', fontFamily: "'Inter', sans-serif" }}>
        <strong>Allocation limit:</strong> The maximum total allocation weight for all policies is{' '}
        <strong>{10000 - Number(bufferBps)} bps ({((10000 - Number(bufferBps)) / 100).toFixed(1)}%)</strong>.
        The remaining {(Number(bufferBps) / 100).toFixed(1)}% is reserved as the liquidity buffer.
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '24px',
          background: 'rgba(255,255,255,0.85)',
          border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: '12px',
          padding: '4px',
        }}
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '10px 8px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === tab.id ? '#1B3A6B' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#6B7280',
              fontSize: '12px',
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.2s',
              textAlign: 'center',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab description */}
      <p style={{ fontSize: '13px', color: '#9CA3AF', fontFamily: "'Inter', sans-serif", marginBottom: '20px' }}>
        {tabs.find(t => t.id === activeTab)?.description}
      </p>

      {/* Tab content */}
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          border: '1px solid rgba(0,0,0,0.08)',
          padding: '28px',
        }}
      >
        {activeTab === 'register' && <RegisterPolicyTab />}
        {activeTab === 'add' && <AddPolicyTab vaultAddress={vaultAddress} />}
        {activeTab === 'premium' && <DepositPremiumTab vaultAddress={vaultAddress} />}
        {activeTab === 'authorize' && <AuthorizeDepositorTab vaultAddress={vaultAddress} />}
      </div>

      {/* Back link */}
      <div style={{ marginTop: '24px' }}>
        <Link
          href={`/app/vault/${vaultAddress}`}
          style={{
            fontSize: '13px',
            color: '#6B7280',
            textDecoration: 'none',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Back to vault detail
        </Link>
      </div>
    </div>
  );
}
