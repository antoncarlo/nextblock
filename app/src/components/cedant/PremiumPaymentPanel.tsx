'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useAddresses } from '@/hooks/useAddresses';
import { useUSDCAllowance, useUSDCBalance } from '@/hooks/useVaultData';
import { INSURANCE_VAULT_ABI, MOCK_USDC_ABI } from '@/config/contracts';
import { formatUSDC } from '@/lib/formatting';

/**
 * Premium payment panel.
 *
 * Two-step wagmi flow:
 *   1. If USDC allowance(vault) < amount → MockUSDC.approve(vault, amount)
 *   2. InsuranceVault.depositPremium(policyId, amount)
 *
 * depositPremium is on-chain-gated by PREMIUM_DEPOSITOR_ROLE; cedants who
 * don't hold it will see the tx revert. The UI surfaces the revert reason
 * via the wagmi error path rather than pre-validating on-chain (avoiding a
 * round-trip on every render).
 *
 * USDC amount is entered in human units (e.g. 1500.00) and converted to
 * 6-decimal base units client-side.
 */
export function PremiumPaymentPanel({ vaultAddress }: { vaultAddress: `0x${string}` }) {
  const { address } = useAccount();
  const { mockUSDC } = useAddresses();
  const { data: balance } = useUSDCBalance(address);
  const { data: allowance } = useUSDCAllowance(address, vaultAddress);

  // Pull the vault's registered policy IDs so the cedant picks from a
  // dropdown instead of typing the id by hand. Falls back to manual input
  // when the read errors (older vault that doesn't expose getPolicyIds).
  const policyIdsRead = useReadContract({
    address: vaultAddress,
    abi: INSURANCE_VAULT_ABI,
    functionName: 'getPolicyIds',
    query: { refetchInterval: 30_000 },
  });
  const registeredPolicyIds: readonly bigint[] = Array.isArray(policyIdsRead.data)
    ? (policyIdsRead.data as readonly bigint[])
    : [];

  const [policyId, setPolicyId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [phase, setPhase] = useState<'idle' | 'approving' | 'depositing'>('idle');
  const [error, setError] = useState<string | null>(null);

  const { writeContract: approve, data: approveTx, isPending: approvePending } = useWriteContract();
  const { writeContract: deposit, data: depositTx, isPending: depositPending } = useWriteContract();

  const approveReceipt = useWaitForTransactionReceipt({ hash: approveTx });
  const depositReceipt = useWaitForTransactionReceipt({ hash: depositTx });

  const amountBaseUnits = (() => {
    const f = Number(amountStr);
    if (!Number.isFinite(f) || f <= 0) return 0n;
    return BigInt(Math.round(f * 1_000_000));
  })();

  const needsApprove = (allowance as bigint | undefined) !== undefined && amountBaseUnits > (allowance as bigint);
  const insufficientBalance = balance !== undefined && amountBaseUnits > (balance as bigint);
  const policyIdValid = /^\d+$/.test(policyId.trim());

  // When approve confirms, kick the deposit.
  useEffect(() => {
    if (phase === 'approving' && approveReceipt.isSuccess) {
      // eslint-disable-next-line
      setPhase('depositing');
      try {
        deposit({
          address: vaultAddress,
          abi: INSURANCE_VAULT_ABI,
          functionName: 'depositPremium',
          args: [BigInt(policyId.trim()), amountBaseUnits],
        });
      } catch (e) {
        setError(e instanceof Error ? e.message.slice(0, 200) : 'deposit tx failed');
        setPhase('idle');
      }
    }
  }, [approveReceipt.isSuccess, phase, vaultAddress, policyId, amountBaseUnits, deposit]);

  // When deposit confirms, reset.
  useEffect(() => {
    if (phase === 'depositing' && depositReceipt.isSuccess) {
      // eslint-disable-next-line
      setPhase('idle');
      setAmountStr('');
    }
  }, [depositReceipt.isSuccess, phase]);

  function start() {
    setError(null);
    if (!policyIdValid) {
      setError('Policy ID must be a positive integer.');
      return;
    }
    if (amountBaseUnits === 0n) {
      setError('Enter a premium amount > 0.');
      return;
    }
    if (insufficientBalance) {
      setError('USDC balance is below the premium amount.');
      return;
    }
    if (needsApprove) {
      setPhase('approving');
      try {
        approve({
          address: mockUSDC,
          abi: MOCK_USDC_ABI,
          functionName: 'approve',
          args: [vaultAddress, amountBaseUnits],
        });
      } catch (e) {
        setError(e instanceof Error ? e.message.slice(0, 200) : 'approve tx failed');
        setPhase('idle');
      }
    } else {
      setPhase('depositing');
      try {
        deposit({
          address: vaultAddress,
          abi: INSURANCE_VAULT_ABI,
          functionName: 'depositPremium',
          args: [BigInt(policyId.trim()), amountBaseUnits],
        });
      } catch (e) {
        setError(e instanceof Error ? e.message.slice(0, 200) : 'deposit tx failed');
        setPhase('idle');
      }
    }
  }

  const busy =
    phase === 'approving' ||
    phase === 'depositing' ||
    approvePending ||
    depositPending ||
    approveReceipt.isLoading ||
    depositReceipt.isLoading;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Pay premium
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        Funds a registered policy on this vault. Requires the connected wallet to hold{' '}
        <code>PREMIUM_DEPOSITOR_ROLE</code>; tx will revert otherwise.
      </p>

      <div className="space-y-2 text-xs">
        <label className="block">
          <span className="text-gray-600">Policy</span>
          {registeredPolicyIds.length > 0 ? (
            <select
              value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1"
            >
              <option value="">Select a policy…</option>
              {registeredPolicyIds.map((id) => (
                <option key={String(id)} value={String(id)}>
                  Policy #{String(id)}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
              placeholder="e.g. 42"
              className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1"
            />
          )}
          <span className="mt-0.5 block text-[10px] text-gray-400">
            {registeredPolicyIds.length > 0
              ? `${registeredPolicyIds.length} registered polic${registeredPolicyIds.length === 1 ? 'y' : 'ies'} on this vault.`
              : 'No registered policies detected on this vault — enter the policy id manually.'}
          </span>
        </label>
        <label className="block">
          <span className="text-gray-600">Premium (USDC)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="1500.00"
            className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1"
          />
          <span className="mt-0.5 block text-[10px] text-gray-400">
            Wallet balance: {balance !== undefined ? `${formatUSDC(balance as bigint)} USDC` : '—'}
          </span>
        </label>

        {error && <p className="text-red-700">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={start}
            disabled={busy || !address}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {phase === 'approving'
              ? approvePending
                ? 'Sign approve…'
                : approveReceipt.isLoading
                  ? 'Approving…'
                  : 'Approving'
              : phase === 'depositing'
                ? depositPending
                  ? 'Sign deposit…'
                  : depositReceipt.isLoading
                    ? 'Depositing…'
                    : 'Depositing'
                : needsApprove
                  ? 'Approve & pay'
                  : 'Pay premium'}
          </button>

          {depositReceipt.isSuccess && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">
              Premium paid ✓
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
