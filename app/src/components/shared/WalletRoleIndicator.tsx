'use client';

import { useAccount } from 'wagmi';
import { useAdminAddress } from '@/hooks/useAdminAddress';

export function WalletRoleIndicator() {
  const { address, isConnected } = useAccount();
  const adminAddress = useAdminAddress();

  if (!isConnected || !address) return null;

  const isAdmin = address.toLowerCase() === adminAddress.toLowerCase();

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isAdmin
          ? 'bg-purple-50 text-purple-700 ring-1 ring-purple-200'
          : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isAdmin ? 'bg-purple-500' : 'bg-blue-500'
        }`}
      />
      {isAdmin ? 'Admin' : 'Investor'}
    </span>
  );
}
