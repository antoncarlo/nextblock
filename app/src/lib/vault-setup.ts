/**
 * The vault setup procedure, derived from vault state alone.
 *
 * Pure and dependency-free on purpose: the ordering and the blocking rules are
 * the part worth testing, and they should be testable without a chain, a wallet
 * or a browser.
 *
 * The steps are NOT the order the manage page used to list them in. Depositing
 * a premium requires PREMIUM_DEPOSITOR_ROLE, so authorising the depositor is a
 * *precondition* of the deposit, not a footnote after it. Listed last, it
 * produced exactly the failure it was meant to prevent: a curator reaching the
 * deposit step and getting a revert the wallet renders as "exceeds max
 * transaction gas limit", which says nothing about what is actually missing.
 *
 * Two preconditions gate `InsuranceVault.depositPremium`, and neither was
 * visible anywhere in the interface:
 *
 *   1. the policy must have been added to THIS vault (`policyAdded`), else
 *      `InsuranceVault__PolicyNotInVault`;
 *   2. the caller must hold the global PREMIUM_DEPOSITOR_ROLE.
 *
 * The role is a protocol role, not the vault's own `authorizedPremiumDepositors`
 * mapping — that mapping is written by `setAuthorizedPremiumDepositor` and read
 * by nothing, so authorising through it granted no permission at all.
 */

export type StepId = 'register' | 'add' | 'authorize' | 'premium';

export interface SetupStep {
  id: StepId;
  /** 1-based position in the procedure. */
  n: number;
  label: string;
  /** What this step accomplishes, in one line. */
  description: string;
  done: boolean;
  /** Set when the step cannot succeed yet; explains what is missing. */
  blockedReason?: string;
}

export interface SetupInputs {
  /** At least one policy has been added to this vault. */
  hasVaultPolicy: boolean;
  /** The connected wallet holds the role that gates premium deposits. */
  callerCanDeposit: boolean;
  /** Premium already received by the vault, in USDC base units. */
  premiumReceived: bigint;
}

export function deriveSetupSteps({
  hasVaultPolicy,
  callerCanDeposit,
  premiumReceived,
}: SetupInputs): SetupStep[] {
  const premiumDone = premiumReceived > 0n;

  // A step that is already done is never also blocked: a precondition explains
  // why something cannot happen yet, and it plainly can, because it has. The
  // two states are contradictory and a screen showing both would be nonsense.
  const premiumBlockedReason = premiumDone
    ? undefined
    : !hasVaultPolicy
      ? 'No policy has been added to this vault yet, so there is nothing to pay a premium against. Finish step 2 first.'
      : !callerCanDeposit
        ? 'This wallet does not hold PREMIUM_DEPOSITOR_ROLE, which is what the vault checks. Finish step 3 first.'
        : undefined;

  return [
    {
      id: 'register',
      n: 1,
      label: 'Register policy',
      description: 'Create the policy in the global registry, with its cover, premium and dates.',
      // A policy in the vault proves one was registered. The registry is
      // protocol-wide, so an empty vault says nothing about step 1 on its own.
      done: hasVaultPolicy,
    },
    {
      id: 'add',
      n: 2,
      label: 'Add to this vault',
      description: 'Allocate the registered policy to this vault and set its weight.',
      done: hasVaultPolicy,
    },
    {
      id: 'authorize',
      n: 3,
      label: 'Authorise the depositor',
      description: 'Grant the address that will pay the premium the role that permits it.',
      done: callerCanDeposit,
    },
    {
      id: 'premium',
      n: 4,
      label: 'Deposit premium',
      description: 'Transfer the USDC premium into the vault, which starts UPR accrual.',
      done: premiumDone,
      // Both preconditions, named in the order the contract checks them.
      blockedReason: premiumBlockedReason,
    },
  ];
}

/** Where to send the curator: the first step that is neither done nor blocked. */
export function firstActionableStep(steps: SetupStep[]): StepId {
  return steps.find((s) => !s.done && !s.blockedReason)?.id ?? steps[steps.length - 1].id;
}
