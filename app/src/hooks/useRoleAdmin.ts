'use client';

import { useCallback, useState } from 'react';
import {
  useChainId,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { PROTOCOL_ROLES_ABI, COMPLIANCE_REGISTRY_ABI, isDeployed } from '@/config/contracts';
import { useAddresses } from './useAddresses';
import { isValidAddress } from '@/lib/roles/handoff';

/**
 * ProtocolRoles read/write model for the KYB -> on-chain role handoff (staging
 * pilot). Reads role membership / role admin / compliance status for a target
 * wallet; writes grantRole through real wagmi. The write reverts on-chain
 * unless msg.sender holds the role's admin (OWNER_ROLE), so the panel only
 * offers it when the connected wallet is the on-chain owner. Onboarding/role
 * handoff only: no revoke, no setWhitelist, no governance Stage A.
 */

const REQUIRED_CHAIN_ID = 84532;
const WRONG_CHAIN_MESSAGE = 'Please switch to Base Sepolia (chain 84532) to continue.';

/**
 * Live on-chain status of (account, role): granted? role admin? whitelisted?
 *
 * The two ProtocolRoles reads share one ABI so they batch cleanly in
 * useReadContracts; ComplianceRegistry.canReceive uses a different ABI and is
 * read separately (mixing ABIs in one multicall breaks wagmi type inference).
 */
export function useRoleStatus(account: string | undefined, roleId: `0x${string}` | undefined) {
  const { protocolRoles, complianceRegistry } = useAddresses();
  const rolesDeployed = isDeployed(protocolRoles);
  const complianceDeployed = isDeployed(complianceRegistry);
  const valid = isValidAddress(account) && !!roleId;

  const roleReads = useReadContracts({
    contracts:
      valid && rolesDeployed
        ? [
            {
              address: protocolRoles,
              abi: PROTOCOL_ROLES_ABI,
              functionName: 'hasRole' as const,
              args: [roleId as `0x${string}`, account as `0x${string}`] as const,
            },
            {
              address: protocolRoles,
              abi: PROTOCOL_ROLES_ABI,
              functionName: 'getRoleAdmin' as const,
              args: [roleId as `0x${string}`] as const,
            },
          ]
        : [],
    query: { enabled: valid && rolesDeployed, refetchInterval: 15_000 },
  });

  const compliance = useReadContract({
    address: complianceRegistry,
    abi: COMPLIANCE_REGISTRY_ABI,
    functionName: 'canReceive',
    args: [account as `0x${string}`],
    query: { enabled: valid && complianceDeployed, refetchInterval: 15_000 },
  });

  const at = (i: number) => (roleReads.data?.[i]?.status === 'success' ? roleReads.data[i].result : undefined);

  return {
    rolesDeployed,
    complianceDeployed,
    isLoading: roleReads.isLoading,
    hasRole: at(0) as boolean | undefined,
    roleAdmin: at(1) as `0x${string}` | undefined,
    canReceive: complianceDeployed ? (compliance.data as boolean | undefined) : undefined,
    refetch: () => {
      void roleReads.refetch();
      void compliance.refetch();
    },
  };
}

/** grantRole writer: chain-guarded, real wagmi. Gate enablement on isOwner in the UI. */
export function useGrantRole(onDone?: () => void) {
  const { protocolRoles } = useAddresses();
  const chainId = useChainId();
  const isWrongChain = chainId !== REQUIRED_CHAIN_ID;

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isSuccess, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });
  const [guardError, setGuardError] = useState<string | null>(null);

  const grantRole = useCallback(
    (roleId: `0x${string}`, account: `0x${string}`) => {
      setGuardError(null);
      if (chainId !== REQUIRED_CHAIN_ID) {
        setGuardError(WRONG_CHAIN_MESSAGE);
        return;
      }
      writeContract(
        {
          address: protocolRoles,
          abi: PROTOCOL_ROLES_ABI,
          functionName: 'grantRole',
          args: [roleId, account],
        },
        { onSuccess: () => onDone?.() },
      );
    },
    [chainId, protocolRoles, writeContract, onDone],
  );

  return {
    grantRole,
    isWrongChain,
    isPending,
    isConfirming,
    isSuccess,
    txHash,
    error: guardError ?? (error ? error.message.split('\n')[0] : null),
    reset: () => {
      setGuardError(null);
      reset();
    },
  };
}
