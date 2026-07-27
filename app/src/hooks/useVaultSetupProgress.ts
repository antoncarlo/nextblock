'use client';

import { useMemo } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { INSURANCE_VAULT_ABI, PROTOCOL_ROLES_ABI } from '@/config/contracts';
import { useAddresses } from '@/hooks/useAddresses';
import { deriveSetupSteps, firstActionableStep, type SetupStep, type StepId } from '@/lib/vault-setup';

export type { SetupStep, StepId } from '@/lib/vault-setup';

/**
 * Live state of the four-step vault setup, so the interface can lead the
 * curator through it instead of offering four independent buttons.
 *
 * The steps are NOT the order the tabs used to sit in. Depositing a premium
 * requires PREMIUM_DEPOSITOR_ROLE, so authorising the depositor is a
 * *precondition* of the deposit, not a footnote after it. Presented as a
 * trailing extra, it produced exactly the failure it was meant to prevent: a
 * curator reaching the deposit step and getting an unreadable revert.
 *
 * Two preconditions gate `depositPremium`, and neither was visible anywhere:
 *
 *   1. the policy must have been added to THIS vault (`policyAdded`), else
 *      `InsuranceVault__PolicyNotInVault`;
 *   2. the caller must hold the global PREMIUM_DEPOSITOR_ROLE.
 *
 * Note the role is a protocol role, not the vault's own
 * `authorizedPremiumDepositors` mapping — that mapping is written by
 * `setAuthorizedPremiumDepositor` and read by nothing, so authorising through
 * it granted no permission at all.
 */

export interface VaultSetupProgress {
  steps: SetupStep[];
  /** The first step that is neither done nor blocked — where to send the user. */
  currentStep: StepId;
  /** Policy ids already added to this vault. */
  vaultPolicyIds: bigint[];
  /** The connected wallet holds the role that gates premium deposits. */
  callerCanDeposit: boolean;
  /** The connected wallet can grant that role (it administers the role). */
  callerCanGrantDeposit: boolean;
  loading: boolean;
  refetch: () => void;
}

const ZERO = '0x0000000000000000000000000000000000000000' as const;

export function useVaultSetupProgress(vaultAddress: `0x${string}`): VaultSetupProgress {
  const { address } = useAccount();
  const addresses = useAddresses();
  const roles = (addresses.protocolRoles ?? ZERO) as `0x${string}`;
  const caller = address ?? ZERO;

  const { data, isLoading, refetch } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: vaultAddress, abi: INSURANCE_VAULT_ABI, functionName: 'getPolicyIds' },
      { address: vaultAddress, abi: INSURANCE_VAULT_ABI, functionName: 'totalPremiumReceived' },
      { address: roles, abi: PROTOCOL_ROLES_ABI, functionName: 'PREMIUM_DEPOSITOR_ROLE' },
      { address: roles, abi: PROTOCOL_ROLES_ABI, functionName: 'OWNER_ROLE' },
    ],
    query: { enabled: roles !== ZERO },
  });

  const depositRole =
    data?.[2]?.status === 'success' ? (data[2].result as `0x${string}`) : undefined;
  const ownerRole = data?.[3]?.status === 'success' ? (data[3].result as `0x${string}`) : undefined;

  const { data: roleData, refetch: refetchRoles } = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: roles,
        abi: PROTOCOL_ROLES_ABI,
        functionName: 'hasRole',
        args: [depositRole ?? ('0x' as `0x${string}`), caller],
      },
      {
        address: roles,
        abi: PROTOCOL_ROLES_ABI,
        functionName: 'hasRole',
        args: [ownerRole ?? ('0x' as `0x${string}`), caller],
      },
    ],
    query: { enabled: Boolean(depositRole && ownerRole && address) },
  });

  const callerCanDeposit = roleData?.[0]?.status === 'success' && roleData[0].result === true;
  const callerCanGrantDeposit = roleData?.[1]?.status === 'success' && roleData[1].result === true;

  const vaultPolicyIds = useMemo(() => {
    const r = data?.[0];
    return r?.status === 'success' && Array.isArray(r.result) ? (r.result as bigint[]) : [];
  }, [data]);

  const premiumReceived =
    data?.[1]?.status === 'success' && typeof data[1].result === 'bigint' ? data[1].result : 0n;

  const steps = useMemo(
    () =>
      deriveSetupSteps({
        hasVaultPolicy: vaultPolicyIds.length > 0,
        callerCanDeposit,
        premiumReceived,
      }),
    [vaultPolicyIds, callerCanDeposit, premiumReceived],
  );

  const currentStep = useMemo(() => firstActionableStep(steps), [steps]);

  return {
    steps,
    currentStep,
    vaultPolicyIds,
    callerCanDeposit,
    callerCanGrantDeposit,
    loading: isLoading,
    refetch: () => {
      void refetch();
      void refetchRoles();
    },
  };
}
