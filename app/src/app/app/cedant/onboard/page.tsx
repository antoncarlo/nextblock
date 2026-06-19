'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { CedantIntakeForm } from '@/components/cedant/CedantIntakeForm';
import { CedantStatusPanel } from '@/components/cedant/CedantStatusPanel';

/**
 * Cedant onboarding orchestrator. Single-page wizard with 4 implicit steps:
 *   1. Form (KYB + cedant profile)            → POST /api/cedant/intake
 *   2. Pending review (KYB + sanctions)       → poll /api/cedant/[id]?wallet=…
 *   3. Vault provisioning                     → Curator signs VaultFactory.createVault;
 *                                               address recorded via /api/cedant/[id]/provision-vault
 *   4. First portfolio commit                 → cedant goes to /app/vault/[address]/manage
 *
 * Step is derived from server state (status + profile.primary_vault_address)
 * so reloads, browser switches, and resuming after a few days all work.
 *
 * applicationId is persisted in localStorage keyed by the connected wallet so
 * a cedant who just submitted can refresh and pick up where they left off.
 */

const LS_KEY = 'nb:cedant-app-id';

export default function CedantOnboardPage() {
  const { address, isConnected } = useAccount();
  const [applicationId, setApplicationId] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    try {
      const k = `${LS_KEY}:${address.toLowerCase()}`;
      const stored = localStorage.getItem(k);
      // eslint-disable-next-line
      if (stored) setApplicationId(stored);
    } catch {
      // localStorage disabled — fine, just no resume.
    }
  }, [address, isConnected]);

  const onSubmitted = (id: string) => {
    setApplicationId(id);
    if (!address) return;
    try {
      localStorage.setItem(`${LS_KEY}:${address.toLowerCase()}`, id);
    } catch {
      // no-op
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">Cedant onboarding</h1>
      <p className="mt-1 text-sm text-gray-500">
        Submit your reinsurance underwriting profile. NextBlock reviews it (KYB + sanctions screening) and
        the Curator provisions a dedicated vault for your ceded portfolios.
      </p>

      {!isConnected ? (
        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Connect your wallet to start. Onboarding is bound to the wallet you submit from; the same wallet
          will later sign on-chain actions on the dedicated vault.
        </div>
      ) : !applicationId ? (
        <CedantIntakeForm walletAddress={address!} onSubmitted={onSubmitted} />
      ) : (
        <CedantStatusPanel applicationId={applicationId} walletAddress={address!} />
      )}
    </div>
  );
}
