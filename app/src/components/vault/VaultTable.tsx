'use client';

import { VaultRow } from './VaultRow';

interface VaultTableProps {
  vaultAddresses: readonly `0x${string}`[];
}

export function VaultTable({ vaultAddresses }: VaultTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
            <th className="px-6 py-3">Vault</th>
            <th className="px-6 py-3">TVL</th>
            <th className="px-6 py-3">Curator</th>
            <th className="px-6 py-3">Exposure</th>
            <th className="px-6 py-3 text-center">Policies</th>
            <th className="px-6 py-3 text-right">Target APY</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {vaultAddresses.map((address) => (
            <VaultRow key={address} vaultAddress={address} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
