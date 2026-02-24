'use client';

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { AmountInput } from './AmountInput';
import { ShareCalculation } from './ShareCalculation';
import { useUSDCBalance, useMaxWithdraw } from '@/hooks/useVaultData';
import { useDepositFlow, type DepositState } from '@/hooks/useDepositFlow';
import { useWithdrawFlow, type WithdrawState } from '@/hooks/useWithdrawFlow';
import { parseUSDC, formatUSDC } from '@/lib/formatting';

type TabMode = 'deposit' | 'withdraw';

interface DepositSidebarProps {
  vaultAddress: `0x${string}`;
  totalAssets: bigint;
  totalSupply: bigint;
  policyCount: number;
  maxWithdrawOverride?: bigint;
}

export function DepositSidebar({
  vaultAddress,
  totalAssets,
  totalSupply,
  policyCount,
  maxWithdrawOverride,
}: DepositSidebarProps) {
  const { address, isConnected } = useAccount();
  const [tab, setTab] = useState<TabMode>('deposit');
  const [inputValue, setInputValue] = useState('');

  const { data: usdcBalance } = useUSDCBalance(address);
  const { data: maxWithdraw } = useMaxWithdraw(
    maxWithdrawOverride !== undefined ? undefined : vaultAddress,
    address
  );

  const parsedAmount = parseUSDC(inputValue);

  // Deposit flow
  const depositFlow = useDepositFlow({
    vaultAddress,
    amount: parsedAmount,
    receiver: address ?? '0x0000000000000000000000000000000000000000',
    onSuccess: () => setInputValue(''),
  });

  // Withdraw flow
  const withdrawFlow = useWithdrawFlow({
    vaultAddress,
    amount: parsedAmount,
    receiver: address ?? '0x0000000000000000000000000000000000000000',
    owner: address ?? '0x0000000000000000000000000000000000000000',
    onSuccess: () => setInputValue(''),
  });

  const handleTabChange = useCallback((newTab: TabMode) => {
    setTab(newTab);
    setInputValue('');
    depositFlow.reset();
    withdrawFlow.reset();
  }, [depositFlow, withdrawFlow]);

  const isProcessing =
    (tab === 'deposit' && depositFlow.state !== 'IDLE' && depositFlow.state !== 'SUCCESS' && depositFlow.state !== 'ERROR') ||
    (tab === 'withdraw' && withdrawFlow.state !== 'IDLE' && withdrawFlow.state !== 'SUCCESS' && withdrawFlow.state !== 'ERROR');

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Tab selector */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => handleTabChange('deposit')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            tab === 'deposit'
              ? 'border-b-2 border-gray-900 text-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Deposit
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('withdraw')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            tab === 'withdraw'
              ? 'border-b-2 border-gray-900 text-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Withdraw
        </button>
      </div>

      <div className="p-4">
        {!isConnected ? (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-500">
              Connect your wallet to deposit or withdraw.
            </p>
          </div>
        ) : tab === 'deposit' ? (
          <DepositTab
            inputValue={inputValue}
            onInputChange={setInputValue}
            parsedAmount={parsedAmount}
            usdcBalance={usdcBalance ?? 0n}
            totalAssets={totalAssets}
            totalSupply={totalSupply}
            policyCount={policyCount}
            flow={depositFlow}
          />
        ) : (
          <WithdrawTab
            inputValue={inputValue}
            onInputChange={setInputValue}
            parsedAmount={parsedAmount}
            maxWithdraw={maxWithdrawOverride ?? maxWithdraw ?? 0n}
            totalAssets={totalAssets}
            totalSupply={totalSupply}
            flow={withdrawFlow}
          />
        )}
      </div>
    </div>
  );
}

/* ---- Deposit Tab ---- */

interface DepositTabProps {
  inputValue: string;
  onInputChange: (v: string) => void;
  parsedAmount: bigint;
  usdcBalance: bigint;
  totalAssets: bigint;
  totalSupply: bigint;
  policyCount: number;
  flow: ReturnType<typeof useDepositFlow>;
}

function DepositTab({
  inputValue,
  onInputChange,
  parsedAmount,
  usdcBalance,
  totalAssets,
  totalSupply,
  policyCount,
  flow,
}: DepositTabProps) {
  if (flow.state === 'SUCCESS') {
    return (
      <div className="py-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
          <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-900">Deposit successful</p>
        <p className="mt-1 text-xs text-gray-500">
          Your capital is now backing {policyCount} insurance{' '}
          {policyCount === 1 ? 'policy' : 'policies'}.
        </p>
        <button
          type="button"
          onClick={flow.reset}
          className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          Make another deposit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AmountInput
        value={inputValue}
        onChange={onInputChange}
        maxAmount={usdcBalance}
        maxLabel="USDC Balance"
        disabled={flow.state !== 'IDLE' && flow.state !== 'ERROR'}
      />

      <ShareCalculation
        mode="deposit"
        amount={parsedAmount}
        totalAssets={totalAssets}
        totalSupply={totalSupply}
      />

      {flow.error && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {flow.error}
        </div>
      )}

      <button
        type="button"
        onClick={flow.startDeposit}
        disabled={
          parsedAmount <= 0n ||
          parsedAmount > usdcBalance ||
          (flow.state !== 'IDLE' && flow.state !== 'ERROR')
        }
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
      >
        {getDepositButtonText(flow.state, parsedAmount, usdcBalance)}
      </button>

      {(flow.state === 'APPROVING' || flow.state === 'DEPOSITING') && (
        <p className="text-center text-xs text-gray-400">
          {flow.state === 'APPROVING'
            ? 'Approving USDC... Please confirm in wallet.'
            : 'Depositing... Please confirm in wallet.'}
        </p>
      )}
    </div>
  );
}

function getDepositButtonText(state: DepositState, amount: bigint, balance: bigint): string {
  if (state === 'APPROVING') return 'Approving...';
  if (state === 'APPROVED') return 'Approved, depositing...';
  if (state === 'DEPOSITING') return 'Depositing...';
  if (amount <= 0n) return 'Enter amount';
  if (amount > balance) return 'Insufficient USDC balance';
  return 'Deposit';
}

/* ---- Withdraw Tab ---- */

interface WithdrawTabProps {
  inputValue: string;
  onInputChange: (v: string) => void;
  parsedAmount: bigint;
  maxWithdraw: bigint;
  totalAssets: bigint;
  totalSupply: bigint;
  flow: ReturnType<typeof useWithdrawFlow>;
}

function WithdrawTab({
  inputValue,
  onInputChange,
  parsedAmount,
  maxWithdraw,
  totalAssets,
  totalSupply,
  flow,
}: WithdrawTabProps) {
  if (flow.state === 'SUCCESS') {
    return (
      <div className="py-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
          <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-900">Withdrawal successful</p>
        <p className="mt-1 text-xs text-gray-500">
          USDC has been transferred to your wallet.
        </p>
        <button
          type="button"
          onClick={flow.reset}
          className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          Withdraw more
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AmountInput
        value={inputValue}
        onChange={onInputChange}
        maxAmount={maxWithdraw}
        maxLabel="Max withdrawable (buffer limited)"
        disabled={flow.state !== 'IDLE' && flow.state !== 'ERROR'}
      />

      <ShareCalculation
        mode="withdraw"
        amount={parsedAmount}
        totalAssets={totalAssets}
        totalSupply={totalSupply}
      />

      {maxWithdraw === 0n && (
        <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
          No buffer available for withdrawal. Capital is deployed to back
          policies.
        </div>
      )}

      {flow.error && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {flow.error}
        </div>
      )}

      <button
        type="button"
        onClick={flow.startWithdraw}
        disabled={
          parsedAmount <= 0n ||
          parsedAmount > maxWithdraw ||
          (flow.state !== 'IDLE' && flow.state !== 'ERROR')
        }
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
      >
        {getWithdrawButtonText(flow.state, parsedAmount, maxWithdraw)}
      </button>

      {flow.state === 'WITHDRAWING' && (
        <p className="text-center text-xs text-gray-400">
          Withdrawing... Please confirm in wallet.
        </p>
      )}
    </div>
  );
}

function getWithdrawButtonText(state: WithdrawState, amount: bigint, maxWithdraw: bigint): string {
  if (state === 'WITHDRAWING') return 'Withdrawing...';
  if (amount <= 0n) return 'Enter amount';
  if (amount > maxWithdraw) return 'Exceeds available buffer';
  return 'Withdraw';
}
