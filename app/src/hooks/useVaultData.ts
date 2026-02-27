"use client";

import { useReadContract, useReadContracts } from "wagmi";
import {
  VAULT_FACTORY_ABI,
  INSURANCE_VAULT_ABI,
  MOCK_USDC_ABI,
} from "@/config/contracts";
import { POLL_INTERVAL } from "@/config/constants";
import { useAddresses } from "./useAddresses";

/**
 * Vault info returned from getVaultInfo().
 */
export interface VaultInfo {
  name: string;
  manager: `0x${string}`;
  assets: bigint;
  shares: bigint;
  sharePrice: bigint;
  bufferBps: bigint;
  feeBps: bigint;
  availableBuffer: bigint;
  deployedCapital: bigint;
  policyCount: bigint;
}

/**
 * Fetch the list of vault addresses from the VaultFactory.
 */
export function useVaultAddresses() {
  const addresses = useAddresses();
  return useReadContract({
    address: addresses.vaultFactory,
    abi: VAULT_FACTORY_ABI,
    functionName: "getVaults",
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled:
        addresses.vaultFactory !== "0x0000000000000000000000000000000000000000",
    },
  });
}

/**
 * Fetch vault info for a single vault address.
 * Uses useReadContracts with allowFailure:true so that contract reverts
 * (e.g. Panic 0x12 division-by-zero on broken vaults) are returned as
 * { status: 'failure', error } instead of throwing, allowing the UI to
 * render a graceful fallback row.
 */
export function useVaultInfo(vaultAddress: `0x${string}` | undefined) {
  const result = useReadContracts({
    contracts: vaultAddress
      ? [
          {
            address: vaultAddress,
            abi: INSURANCE_VAULT_ABI,
            functionName: "getVaultInfo" as const,
          },
        ]
      : [],
    allowFailure: true,
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: !!vaultAddress,
    },
  });

  const first = result.data?.[0];
  return {
    ...result,
    data: first?.status === "success" ? first.result : undefined,
    error: first?.status === "failure" ? first.error : result.error,
  };
}

/**
 * Fetch vault info for multiple vaults in a single multicall.
 */
export function useMultiVaultInfo(
  vaultAddresses: readonly `0x${string}`[] | undefined,
) {
  const contracts = (vaultAddresses ?? []).map((address) => ({
    address,
    abi: INSURANCE_VAULT_ABI,
    functionName: "getVaultInfo" as const,
  }));

  return useReadContracts({
    contracts,
    allowFailure: true,
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: !!vaultAddresses && vaultAddresses.length > 0,
    },
  });
}

/**
 * Fetch user's share balance for a specific vault.
 */
export function useUserShares(
  vaultAddress: `0x${string}` | undefined,
  userAddress: `0x${string}` | undefined,
) {
  return useReadContract({
    address: vaultAddress,
    abi: INSURANCE_VAULT_ABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: !!vaultAddress && !!userAddress,
    },
  });
}

/**
 * Fetch user's max withdrawable amount from a vault.
 */
export function useMaxWithdraw(
  vaultAddress: `0x${string}` | undefined,
  userAddress: `0x${string}` | undefined,
) {
  return useReadContract({
    address: vaultAddress,
    abi: INSURANCE_VAULT_ABI,
    functionName: "maxWithdraw",
    args: userAddress ? [userAddress] : undefined,
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: !!vaultAddress && !!userAddress,
    },
  });
}

/**
 * Fetch user's USDC balance.
 */
export function useUSDCBalance(userAddress: `0x${string}` | undefined) {
  const addresses = useAddresses();
  return useReadContract({
    address: addresses.mockUSDC,
    abi: MOCK_USDC_ABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled:
        !!userAddress &&
        addresses.mockUSDC !== "0x0000000000000000000000000000000000000000",
    },
  });
}

/**
 * Fetch USDC allowance for a vault.
 */
export function useUSDCAllowance(
  userAddress: `0x${string}` | undefined,
  spenderAddress: `0x${string}` | undefined,
) {
  const addresses = useAddresses();
  return useReadContract({
    address: addresses.mockUSDC,
    abi: MOCK_USDC_ABI,
    functionName: "allowance",
    args:
      userAddress && spenderAddress ? [userAddress, spenderAddress] : undefined,
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled:
        !!userAddress &&
        !!spenderAddress &&
        addresses.mockUSDC !== "0x0000000000000000000000000000000000000000",
    },
  });
}

/**
 * Fetch total pending claims for a vault (shortfall claims awaiting manual exercise).
 */
export function usePendingClaims(vaultAddress: `0x${string}` | undefined) {
  return useReadContract({
    address: vaultAddress,
    abi: INSURANCE_VAULT_ABI,
    functionName: "totalPendingClaims",
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: !!vaultAddress,
    },
  });
}

/**
 * Preview how many shares a deposit amount would yield.
 */
export function usePreviewDeposit(
  vaultAddress: `0x${string}` | undefined,
  assets: bigint,
) {
  return useReadContract({
    address: vaultAddress,
    abi: INSURANCE_VAULT_ABI,
    functionName: "previewDeposit",
    args: [assets],
    query: {
      enabled: !!vaultAddress && assets > 0n,
    },
  });
}

/**
 * Fetch multiple user position data points in a single multicall.
 */
export function useUserPositions(
  vaultAddresses: readonly `0x${string}`[] | undefined,
  userAddress: `0x${string}` | undefined,
) {
  const contracts = (vaultAddresses ?? []).flatMap((address) => [
    {
      address,
      abi: INSURANCE_VAULT_ABI,
      functionName: "balanceOf" as const,
      args: userAddress ? ([userAddress] as const) : undefined,
    },
    {
      address,
      abi: INSURANCE_VAULT_ABI,
      functionName: "convertToAssets" as const,
      args: [1n] as const, // Will multiply by balance client-side
    },
  ]);

  return useReadContracts({
    contracts,
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: !!vaultAddresses && vaultAddresses.length > 0 && !!userAddress,
    },
  });
}

/**
 * Fetch vault data using individual contract functions instead of getVaultInfo().
 * This is a fallback for vaults where getVaultInfo() reverts (e.g. Panic 0x12
 * division-by-zero caused by a zero-duration policy in the registry).
 * Returns data in the same shape as VaultInfo so callers can use it transparently.
 */
export function useVaultInfoFallback(vaultAddress: `0x${string}` | undefined) {
  const result = useReadContracts({
    contracts: vaultAddress
      ? [
          { address: vaultAddress, abi: INSURANCE_VAULT_ABI, functionName: "vaultName" as const },
          { address: vaultAddress, abi: INSURANCE_VAULT_ABI, functionName: "vaultManager" as const },
          { address: vaultAddress, abi: INSURANCE_VAULT_ABI, functionName: "totalAssets" as const },
          { address: vaultAddress, abi: INSURANCE_VAULT_ABI, functionName: "totalSupply" as const },
          { address: vaultAddress, abi: INSURANCE_VAULT_ABI, functionName: "bufferRatioBps" as const },
          { address: vaultAddress, abi: INSURANCE_VAULT_ABI, functionName: "managementFeeBps" as const },
          { address: vaultAddress, abi: INSURANCE_VAULT_ABI, functionName: "totalDeployedCapital" as const },
          { address: vaultAddress, abi: INSURANCE_VAULT_ABI, functionName: "totalPendingClaims" as const },
        ]
      : [],
    allowFailure: true,
    query: {
      refetchInterval: POLL_INTERVAL,
      enabled: !!vaultAddress,
    },
  });

  const d = result.data;
  if (!d || d.length < 8) {
    return { ...result, data: undefined };
  }

  const get = (i: number) => (d[i]?.status === "success" ? d[i].result : undefined);

  const name = get(0) as string | undefined;
  const manager = get(1) as `0x${string}` | undefined;
  const assets = get(2) as bigint | undefined;
  const shares = get(3) as bigint | undefined;
  const bufferBps = get(4) as bigint | undefined;
  const feeBps = get(5) as bigint | undefined;
  const deployedCapital = get(6) as bigint | undefined;

  // If we couldn't read even the basics, return undefined
  if (!name || !manager || assets === undefined || shares === undefined) {
    return { ...result, data: undefined };
  }

  // Reconstruct sharePrice safely (avoid division by zero)
  const sharePrice = shares > 0n ? (assets * BigInt(1e18)) / shares : BigInt(1e6);
  // availableBuffer = assets - deployedCapital (simplified, avoids the broken internal calc)
  const dc = deployedCapital ?? 0n;
  const availableBuffer = assets > dc ? assets - dc : 0n;

  // Count policies from the vaultPolicies array length — we approximate as 0 here
  // (policyCount is not critical for display; VaultRow reads it separately)
  const policyCount = 0n;

  const vaultInfo: [string, `0x${string}`, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] = [
    name,
    manager,
    assets,
    shares,
    sharePrice,
    bufferBps ?? 0n,
    feeBps ?? 0n,
    availableBuffer,
    dc,
    policyCount,
  ];

  return { ...result, data: vaultInfo };
}

/**
 * Smart vault info hook: tries getVaultInfo() first, falls back to individual
 * function calls if the contract reverts (e.g. Panic 0x12 on Vault A).
 */
export function useVaultInfoSafe(vaultAddress: `0x${string}` | undefined) {
  const primary = useVaultInfo(vaultAddress);
  const fallback = useVaultInfoFallback(vaultAddress);

  // If primary succeeded, use it; otherwise use fallback
  if (primary.data !== undefined) {
    return { ...primary, usingFallback: false };
  }
  return { ...fallback, usingFallback: true };
}
