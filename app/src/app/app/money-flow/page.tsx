'use client';

import { useReadContract } from 'wagmi';
import { useAddresses } from '@/hooks/useAddresses';
import { VAULT_FACTORY_ABI, isDeployed } from '@/config/contracts';
import { MoneyFlowDashboard } from '@/components/moneyflow/MoneyFlowDashboard';
import { InvestorStatement } from '@/components/moneyflow/InvestorStatement';

export default function MoneyFlowPage() {
  const { vaultFactory } = useAddresses();
  const { data: vaults } = useReadContract({
    address: vaultFactory,
    abi: VAULT_FACTORY_ABI,
    functionName: 'getVaults',
    query: { enabled: isDeployed(vaultFactory) },
  });
  const vault = (vaults as readonly `0x${string}`[] | undefined)?.[0];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Money Flow</h1>
      <p className="mb-6 text-sm text-gray-500">
        Unified economic view of the vault — SPV calculation, buffer, protocol take, investor vault,
        claim payment and protocol fees — read live from the on-chain model.
      </p>
      <div className="space-y-6">
        <MoneyFlowDashboard vault={vault} />
        <InvestorStatement vault={vault} />
      </div>
    </div>
  );
}
