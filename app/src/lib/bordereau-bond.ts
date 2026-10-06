/**
 * What a signer must do before proposing a bordereau assertion.
 *
 * The UMA-backed oracle (`UmaBordereauOracle`) pulls a USDC bond from the proposer inside
 * `proposeAssertion`, so the proposer must hold the bond and must have approved the oracle for
 * it. The stand-in oracle (`BordereauOracle`) takes no bond and has no `effectiveBond()`.
 * One page serves both: it reads the bond, and when the read gives nothing it behaves as
 * before. The wallet simulates the transaction, so a wrongly assumed "no bond" shows up as a
 * revert before anything is signed, never as lost funds.
 *
 * Pure: no wagmi, no network, so it runs under `node --experimental-strip-types`.
 */

export type BondStep =
  /** The bond or the signer's balances are still being read. */
  | { kind: 'loading' }
  /** No bond sits behind this oracle: propose directly. */
  | { kind: 'none' }
  /** The signer holds less USDC than the bond. */
  | { kind: 'insufficient-balance'; bond: bigint; balance: bigint }
  /** The oracle is not yet approved for the bond: approve first. */
  | { kind: 'approve'; bond: bigint }
  /** Balance and approval cover the bond: propose. */
  | { kind: 'ready'; bond: bigint };

export interface BondInputs {
  /**
   * The bond a proposal would post, in USDC base units. `undefined` while it is being read,
   * `null` when the oracle has no such function (the stand-in) or the read failed.
   */
  bond: bigint | null | undefined;
  /** The signer's USDC allowance to the oracle, if already read. */
  allowance: bigint | undefined;
  /** The signer's USDC balance, if already read. */
  balance: bigint | undefined;
}

/** Decide the next step for a signer about to propose. */
export function bondStep({ bond, allowance, balance }: BondInputs): BondStep {
  if (bond === undefined) return { kind: 'loading' };
  if (bond === null || bond === 0n) return { kind: 'none' };
  if (allowance === undefined || balance === undefined) return { kind: 'loading' };
  if (balance < bond) return { kind: 'insufficient-balance', bond, balance };
  if (allowance < bond) return { kind: 'approve', bond };
  return { kind: 'ready', bond };
}

/** The label of the single button, given the step and what the wallet is doing. */
export function bondButtonLabel(
  step: BondStep,
  state: { approving: boolean; approved: boolean; proposing: boolean; proposed: boolean; signing: boolean },
  format: (amount: bigint) => string,
): string {
  if (state.proposed) return 'Proposed ✓';
  if (state.proposing) return 'Proposing…';
  if (state.signing) return 'Sign tx…';
  if (state.approving) return 'Approving…';
  switch (step.kind) {
    case 'loading':
      return 'Reading the bond…';
    case 'insufficient-balance':
      return `Needs ${format(step.bond)} USDC`;
    case 'approve':
      return `Approve ${format(step.bond)} USDC`;
    default:
      return 'Propose on-chain';
  }
}

/** True when pressing the button would send a transaction that can succeed. */
export function bondActionable(step: BondStep): boolean {
  return step.kind === 'none' || step.kind === 'approve' || step.kind === 'ready';
}
