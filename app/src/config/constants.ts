/**
 * USDC uses 6 decimals.
 */
export const USDC_DECIMALS = 6;

/**
 * Vault share token uses 18 decimals.
 */
export const SHARE_DECIMALS = 18;

/**
 * 1 USDC in raw units.
 */
export const ONE_USDC = 1_000_000n;

/**
 * Polling interval for contract reads (milliseconds).
 */
export const POLL_INTERVAL = 10_000;

/**
 * NAV interpolation tick rate (milliseconds).
 */
export const NAV_TICK_INTERVAL = 1_000;

/**
 * Seconds per day.
 */
export const SECONDS_PER_DAY = 86_400;

/**
 * Seconds per year (365 days).
 */
export const SECONDS_PER_YEAR = 31_536_000;

/**
 * Basis points denominator.
 */
export const BASIS_POINTS = 10_000;

/**
 * Admin wallet addresses (multi-admin support).
 * All addresses in this list have full admin privileges.
 */
export const ADMIN_ADDRESSES: string[] = [
  '0x3630082d96065B756E84B8b79e030a525B9583ed', // NextBlock Primary Admin
  '0x810fa6726eeB6014c2F77Bb4802A5734C28b0F3e', // NextBlock Co-Admin
];

/**
 * Admin wallet address per chain (primary admin, kept for backward compatibility).
 */
export const CHAIN_ADMIN_ADDRESS: Record<number, `0x${string}`> = {
  84532: '0x3630082d96065B756E84B8b79e030a525B9583ed', // Base Sepolia — Primary Admin
  11155111: '0x3630082d96065B756E84B8b79e030a525B9583ed', // Ethereum Sepolia — Primary Admin
  5042002: '0x3630082d96065B756E84B8b79e030a525B9583ed', // Arc Testnet — Primary Admin
  1: '0x3630082d96065B756E84B8b79e030a525B9583ed', // Ethereum Mainnet — Primary Admin
  8453: '0x3630082d96065B756E84B8b79e030a525B9583ed', // Base Mainnet — Primary Admin
  31337: '0x3630082d96065B756E84B8b79e030a525B9583ed', // Anvil local — Primary Admin
};

/**
 * Default admin address (Anvil).
 */
export const ADMIN_ADDRESS = CHAIN_ADMIN_ADDRESS[31337]!;

/**
 * Verification type enum (matches Solidity PolicyRegistry.VerificationType).
 */
export enum VerificationType {
  ON_CHAIN = 0,
  ORACLE_DEPENDENT = 1,
  OFF_CHAIN = 2,
}

/**
 * Policy status enum (matches Solidity PolicyRegistry.PolicyStatus).
 */
export enum PolicyStatus {
  REGISTERED = 0,
  ACTIVE = 1,
  CLAIMED = 2,
  EXPIRED = 3,
}

/**
 * Vault metadata constants (display info not stored on-chain).
 */
export const VAULT_METADATA: Record<string, {
  displayName: string;
  manager: string;
  strategy: string;
  riskLevel: 'Low' | 'Moderate' | 'High';
  targetApy: string;
}> = {};

/**
 * Verification type display config.
 */
export const VERIFICATION_CONFIG = {
  [VerificationType.ON_CHAIN]: {
    label: 'On-chain',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    dotColor: 'bg-emerald-500',
    description: 'Trustless, permissionless verification',
  },
  [VerificationType.ORACLE_DEPENDENT]: {
    label: 'Oracle',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    dotColor: 'bg-amber-500',
    description: 'Oracle-dependent verification',
  },
  [VerificationType.OFF_CHAIN]: {
    label: 'Off-chain',
    color: 'text-slate-600',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    dotColor: 'bg-slate-500',
    description: 'Insurer-assessed verification',
  },
} as const;

/**
 * Policy status display config.
 */
export const STATUS_CONFIG = {
  [PolicyStatus.REGISTERED]: {
    label: 'Registered',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  [PolicyStatus.ACTIVE]: {
    label: 'Active',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  [PolicyStatus.CLAIMED]: {
    label: 'Claimed',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  [PolicyStatus.EXPIRED]: {
    label: 'Expired',
    color: 'text-gray-500',
    bgColor: 'bg-gray-50',
  },
} as const;
