'use client';

import { useCallback, useState } from 'react';
import {
  useChainId,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { COMPLIANCE_REGISTRY_ABI, PROTOCOL_ROLES_ABI, isDeployed } from '@/config/contracts';
import { useAddresses } from './useAddresses';
import { ROLE_IDS } from './useProtocolAccess';
import { isValidAddress } from '@/lib/compliance/whitelist';

/**
 * ComplianceRegistry whitelist read/write model for the LP onboarding admin
 * (staging pilot). Reads the target wallet's effective eligibility
 * (`canReceive`) and raw whitelist flag, and whether the connected wallet may
 * operate as KYC_OPERATOR (the on-chain authority for setWhitelist). The write
 * reverts on-chain unless msg.sender holds KYC_OPERATOR_ROLE, so the panel only
 * enables the direct write for that wallet; everyone else gets Safe calldata.
 */

const REQUIRED_CHAIN_ID = 84532;
const WRONG_CHAIN_MESSAGE = 'Please switch to Base Sepolia (chain 84532) to continue.';

/** Live whitelist/eligibility status for `target`, plus connected-wallet authority. */
export function useWhitelistStatus(target: string | undefined, connected: string | undefined) {
  const { complianceRegistry, protocolRoles } = useAddresses();
  const complianceDeployed = isDeployed(complianceRegistry);
  const rolesDeployed = isDeployed(protocolRoles);
  const validTarget = isValidAddress(target);

  // Both reads share the ComplianceRegistry ABI -> one homogeneous multicall.
  const reg = useReadContracts({
    contracts:
      validTarget && complianceDeployed
        ? [
            {
              address: complianceRegistry,
              abi: COMPLIANCE_REGISTRY_ABI,
              functionName: 'canReceive' as const,
              args: [target as `0x${string}`] as const,
            },
            {
              address: complianceRegistry,
              abi: COMPLIANCE_REGISTRY_ABI,
              functionName: 'whitelisted' as const,
              args: [target as `0x${string}`] as const,
            },
          ]
        : [],
    query: { enabled: validTarget && complianceDeployed, refetchInterval: 15_000 },
  });

  // KYC_OPERATOR_ROLE membership of the connected wallet (separate ABI -> own read).
  const operatorRole = useReadContract({
    address: protocolRoles,
    abi: PROTOCOL_ROLES_ABI,
    functionName: 'hasRole',
    args: [ROLE_IDS.KYC_OPERATOR, (connected ?? '0x0000000000000000000000000000000000000000') as `0x${string}`],
    query: { enabled: !!connected && isValidAddress(connected) && rolesDeployed, refetchInterval: 15_000 },
  });

  const at = (i: number) => (reg.data?.[i]?.status === 'success' ? reg.data[i].result : undefined);

  return {
    complianceDeployed,
    rolesDeployed,
    isLoading: reg.isLoading,
    canReceive: at(0) as boolean | undefined,
    whitelisted: at(1) as boolean | undefined,
    isAuthorizedOperator: operatorRole.data === true,
    refetch: () => {
      void reg.refetch();
      void operatorRole.refetch();
    },
  };
}

/** setWhitelist writer: chain-guarded, real wagmi. Gate enablement on KYC_OPERATOR in the UI. */
export function useSetWhitelist(onDone?: () => void) {
  const { complianceRegistry } = useAddresses();
  const chainId = useChainId();
  const isWrongChain = chainId !== REQUIRED_CHAIN_ID;

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isSuccess, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });
  const [guardError, setGuardError] = useState<string | null>(null);

  const setWhitelist = useCallback(
    (user: `0x${string}`, allowed: boolean) => {
      setGuardError(null);
      if (chainId !== REQUIRED_CHAIN_ID) {
        setGuardError(WRONG_CHAIN_MESSAGE);
        return;
      }
      writeContract(
        {
          address: complianceRegistry,
          abi: COMPLIANCE_REGISTRY_ABI,
          functionName: 'setWhitelist',
          args: [user, allowed],
        },
        { onSuccess: () => onDone?.() },
      );
    },
    [chainId, complianceRegistry, writeContract, onDone],
  );

  return {
    setWhitelist,
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
