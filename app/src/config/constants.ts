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
 * LEGACY ADMIN UI HINT — NOT A SECURITY BOUNDARY.
 *
 * These addresses only decide whether the admin dashboard UI renders for a
 * connected wallet, as a fallback for legacy demo wallets that hold no
 * on-chain role yet. Real authorization lives exclusively:
 *   - on-chain, in ProtocolRoles (OWNER/SENTINEL/COMMITTEE checks), and
 *   - server-side, in the KYB APIs (wallet signature + on-chain role check).
 * Anyone can bypass this client-side gate by editing the bundle: nothing
 * privileged is reachable through it. The primary admin gate is the on-chain
 * role check in the admin page (useProtocolAccess).
 */
export const LEGACY_ADMIN_UI_HINT: string[] = [
  '0x3630082d96065B756E84B8b79e030a525B9583ed', // legacy demo admin
  '0x810fa6726eeB6014c2F77Bb4802A5734C28b0F3e', // legacy demo co-admin
];

/**
 * LEGACY per-chain admin hint — NOT A SECURITY BOUNDARY (see above).
 * Consumed only by the legacy demo WalletRoleIndicator. Base-only MVP plus
 * the legacy demo chains still present in chains.ts; no mainnet entries.
 */
export const CHAIN_ADMIN_ADDRESS: Record<number, `0x${string}`> = {
  84532: '0x3630082d96065B756E84B8b79e030a525B9583ed', // Base Sepolia staging
  11155111: '0x3630082d96065B756E84B8b79e030a525B9583ed', // Ethereum Sepolia (legacy demo)
  5042002: '0x3630082d96065B756E84B8b79e030a525B9583ed', // Arc Testnet (legacy demo)
  31337: '0x3630082d96065B756E84B8b79e030a525B9583ed', // Anvil local
};

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
