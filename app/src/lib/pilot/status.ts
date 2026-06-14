/**
 * Pure pilot-onboarding status logic (no React, no wagmi): chain check, testnet
 * asset requirements, KYB status labels, role-track derivation and the
 * deterministic next-action computation.
 *
 * Shared by the Pilot Onboarding Hub UI and the node strip-types smoke script,
 * so it must stay dependency-free and erasable-syntax-only (no TS `enum`).
 *
 * Base Sepolia testnet only. No real funds, no mainnet, no production readiness.
 */

/** Base Sepolia testnet chain id (the only supported pilot chain). */
export const PILOT_CHAIN_ID = 84532;

/** Recommended minimum Base Sepolia ETH (wei) to cover gas for a few actions: 0.005 ETH. */
export const MIN_ETH_WEI = 5_000_000_000_000_000n;

/** Minimum test USDC (6 decimals) to consider a wallet funded for deposit/premium demos: 1 USDC. */
export const MIN_USDC_6 = 1_000_000n;

/** Test USDC minted per faucet click in the existing DepositSidebar faucet. */
export const FAUCET_USDC_AMOUNT_6 = 10_000_000_000n; // 10,000 USDC

/** External Base Sepolia ETH faucets (gas cannot be minted on-chain). Guidance only. */
export const ETH_FAUCET_LINKS: readonly { label: string; url: string }[] = [
  { label: 'Coinbase Developer Platform faucet', url: 'https://portal.cdp.coinbase.com/products/faucet' },
  { label: 'Alchemy Base Sepolia faucet', url: 'https://www.alchemy.com/faucets/base-sepolia' },
];

/** KYB lifecycle state as seen by the hub (incl. transport states). */
export type KybState =
  | 'loading'
  | 'unavailable'
  | 'none'
  | 'submitted'
  | 'under_review'
  | 'needs_info'
  | 'approved'
  | 'rejected';

export const KYB_STATE_LABEL: Record<KybState, string> = {
  loading: 'Checking…',
  unavailable: 'Backend offline',
  none: 'Not submitted',
  submitted: 'Submitted',
  under_review: 'Under review',
  needs_info: 'Needs info',
  approved: 'Approved',
  rejected: 'Rejected',
};

export function kybStatusLabel(state: KybState): string {
  return KYB_STATE_LABEL[state] ?? 'Unknown';
}

export interface RoleFlags {
  isOwner: boolean;
  isCurator: boolean;
  isCedant: boolean;
  isCommittee: boolean;
  isSentinel: boolean;
  isAllocator: boolean;
}

export const NO_ROLES: RoleFlags = {
  isOwner: false,
  isCurator: false,
  isCedant: false,
  isCommittee: false,
  isSentinel: false,
  isAllocator: false,
};

export function hasAnyRole(roles: RoleFlags): boolean {
  return (
    roles.isOwner ||
    roles.isCurator ||
    roles.isCedant ||
    roles.isCommittee ||
    roles.isSentinel ||
    roles.isAllocator
  );
}

/** A self-service track keyed to an on-chain role flag and its home route. */
export interface RoleTrack {
  key: string;
  label: string;
  description: string;
  route: string;
  flag: keyof RoleFlags;
}

export const ROLE_TRACKS: readonly RoleTrack[] = [
  { key: 'CEDANT', label: 'Company / Cedant', description: 'Submit portfolios and claims.', route: '/app/my-company', flag: 'isCedant' },
  { key: 'CURATOR', label: 'Curator / Underwriting', description: 'Review, approve and activate portfolios; resolve claims.', route: '/app/syndicates/dashboard', flag: 'isCurator' },
  { key: 'ASSET_MANAGER', label: 'Asset Manager / Vault Manager', description: 'Vault strategy oversight (allocation UI ships in a later branch).', route: '/app/syndicates/dashboard', flag: 'isCurator' },
  { key: 'COMMITTEE', label: 'Committee Member', description: 'Off-chain claim approval path.', route: '/app/admin', flag: 'isCommittee' },
  { key: 'SENTINEL', label: 'Sentinel / Admin', description: 'Pause and dispute risk actions; never moves funds.', route: '/app/admin', flag: 'isSentinel' },
  { key: 'OPERATOR', label: 'Protocol Operator', description: 'KYB review and on-chain role grants.', route: '/app/admin', flag: 'isOwner' },
];

/** The always-available read-only track (no role required). */
export const VIEWER_TRACK: RoleTrack = {
  key: 'VIEWER',
  label: 'B2B Demo Viewer',
  description: 'Browse on-chain protocol state read-only. No role required.',
  route: '/app',
  flag: 'isOwner', // unused for viewer; viewer is always available
};

/** Tracks the wallet currently qualifies for, plus the always-on viewer track. */
export function deriveActiveTracks(roles: RoleFlags): RoleTrack[] {
  const active = ROLE_TRACKS.filter(t => roles[t.flag]);
  return [...active, VIEWER_TRACK];
}

export function isCorrectChain(chainId: number | undefined): boolean {
  return chainId === PILOT_CHAIN_ID;
}

/** undefined balance = still loading; treat as not-yet-met. */
export function meetsEthRequirement(weiBalance: bigint | undefined): boolean {
  return weiBalance !== undefined && weiBalance >= MIN_ETH_WEI;
}

export function meetsUsdcRequirement(usdc6Balance: bigint | undefined): boolean {
  return usdc6Balance !== undefined && usdc6Balance >= MIN_USDC_6;
}

export interface PilotInput {
  walletConnected: boolean;
  chainId: number | undefined;
  ethWei: bigint | undefined;
  usdc6: bigint | undefined;
  kyb: KybState;
  roles: RoleFlags;
  /** true once useProtocolAccess has resolved on-chain (status === 'onchain'). */
  rolesResolved: boolean;
}

export type NextActionSeverity = 'blocked' | 'action' | 'ready' | 'info';

export interface NextAction {
  severity: NextActionSeverity;
  message: string;
  /** Optional CTA: an internal route or an external url. */
  ctaLabel?: string;
  ctaRoute?: string;
  ctaUrl?: string;
}

/**
 * Single deterministic "what do I do next" instruction, evaluated in priority
 * order. Pure: same input always yields the same action.
 */
export function nextAction(input: PilotInput): NextAction {
  if (!input.walletConnected) {
    return { severity: 'blocked', message: 'Connect your wallet to begin the pilot onboarding.' };
  }
  if (!isCorrectChain(input.chainId)) {
    return { severity: 'blocked', message: 'Switch your wallet to Base Sepolia (chain 84532).' };
  }
  if (input.ethWei === undefined) {
    return { severity: 'info', message: 'Checking your testnet balances…' };
  }
  if (!meetsEthRequirement(input.ethWei)) {
    return {
      severity: 'blocked',
      message: 'Get Base Sepolia ETH from a faucet — gas is required for every on-chain action.',
      ctaLabel: 'Open ETH faucet',
      ctaUrl: ETH_FAUCET_LINKS[0].url,
    };
  }
  if (input.kyb === 'loading') {
    return { severity: 'info', message: 'Checking your KYB status…' };
  }
  if (input.kyb === 'unavailable') {
    return { severity: 'info', message: 'KYB backend is offline. Ask the protocol operator to enable it before applying.' };
  }
  if (input.kyb === 'none') {
    return { severity: 'action', message: 'Submit your KYB application to start onboarding.', ctaLabel: 'Apply (KYB)', ctaRoute: '/app/apply' };
  }
  if (input.kyb === 'rejected') {
    return { severity: 'blocked', message: 'Your KYB was rejected. Contact the protocol operator for next steps.' };
  }
  if (input.kyb === 'submitted' || input.kyb === 'under_review' || input.kyb === 'needs_info') {
    return { severity: 'info', message: 'KYB is under review. The operator will process it; check back shortly.' };
  }
  // KYB approved from here.
  if (!input.rolesResolved) {
    return { severity: 'info', message: 'Resolving your on-chain roles…' };
  }
  if (!hasAnyRole(input.roles)) {
    return {
      severity: 'action',
      message: 'KYB approved. The operator must grant your on-chain role — share your wallet address with them.',
    };
  }
  if (input.roles.isCedant && !meetsUsdcRequirement(input.usdc6)) {
    return {
      severity: 'action',
      message: 'You hold a role. Mint test USDC from the faucet to fund deposits and premium flows.',
      ctaLabel: 'Mint test USDC',
    };
  }
  const tracks = deriveActiveTracks(input.roles);
  const primary = tracks[0];
  return {
    severity: 'ready',
    message: 'You are set up for the pilot. Open your role dashboard to continue.',
    ctaLabel: `Go to ${primary.label}`,
    ctaRoute: primary.route,
  };
}

export type ChecklistState = 'ok' | 'todo' | 'pending' | 'loading' | 'na';

export interface ChecklistItem {
  key: string;
  label: string;
  state: ChecklistState;
  detail: string;
}

/** The ordered checklist rendered by the hub. Pure derivation of UI state. */
export function computeChecklist(input: PilotInput): ChecklistItem[] {
  const wallet: ChecklistItem = {
    key: 'wallet',
    label: 'Wallet connected',
    state: input.walletConnected ? 'ok' : 'todo',
    detail: input.walletConnected ? 'Wallet connected.' : 'Connect a wallet to continue.',
  };

  const chain: ChecklistItem = {
    key: 'chain',
    label: 'Network: Base Sepolia (84532)',
    state: !input.walletConnected ? 'na' : isCorrectChain(input.chainId) ? 'ok' : 'todo',
    detail: isCorrectChain(input.chainId) ? 'On Base Sepolia testnet.' : 'Switch to Base Sepolia (chain 84532).',
  };

  const eth: ChecklistItem = {
    key: 'eth',
    label: 'Base Sepolia ETH (gas)',
    state: !input.walletConnected
      ? 'na'
      : input.ethWei === undefined
      ? 'loading'
      : meetsEthRequirement(input.ethWei)
      ? 'ok'
      : 'todo',
    detail: meetsEthRequirement(input.ethWei)
      ? 'Enough testnet ETH for gas.'
      : 'Low on testnet ETH — use an external Base Sepolia faucet.',
  };

  const usdc: ChecklistItem = {
    key: 'usdc',
    label: 'Test USDC (deposits / premium)',
    state: !input.walletConnected
      ? 'na'
      : input.usdc6 === undefined
      ? 'loading'
      : meetsUsdcRequirement(input.usdc6)
      ? 'ok'
      : 'todo',
    detail: meetsUsdcRequirement(input.usdc6)
      ? 'Has test USDC (MockUSDC, test-only).'
      : 'Mint test USDC from the faucet (MockUSDC, test-only — no real value).',
  };

  const kyb: ChecklistItem = {
    key: 'kyb',
    label: 'KYB application',
    state: !input.walletConnected
      ? 'na'
      : input.kyb === 'loading'
      ? 'loading'
      : input.kyb === 'approved'
      ? 'ok'
      : input.kyb === 'rejected'
      ? 'todo'
      : input.kyb === 'unavailable'
      ? 'na'
      : input.kyb === 'none'
      ? 'todo'
      : 'pending',
    detail: kybStatusLabel(input.kyb),
  };

  const role: ChecklistItem = {
    key: 'role',
    label: 'On-chain role',
    state: !input.walletConnected
      ? 'na'
      : !input.rolesResolved
      ? 'loading'
      : hasAnyRole(input.roles)
      ? 'ok'
      : 'todo',
    detail: hasAnyRole(input.roles)
      ? 'At least one operational role granted.'
      : 'No on-chain role yet — operator grants it after KYB approval.',
  };

  return [wallet, chain, eth, usdc, kyb, role];
}
