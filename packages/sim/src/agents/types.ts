import type { Rng } from '../risk/prng.ts';
import type { Finding } from '../report/finding.ts';

/** Roles as they exist in ProtocolRoles. Null means the agent holds none. */
export type RoleId =
  | 'OWNER'
  | 'UNDERWRITING_CURATOR'
  | 'ALLOCATOR'
  | 'SENTINEL'
  | 'CLAIMS_COMMITTEE'
  | 'KYC_OPERATOR'
  | 'ORACLE'
  | 'AUTHORIZED_CEDANT'
  | 'PREMIUM_DEPOSITOR'
  | 'VAULT_FACTORY';

/**
 * What an action is expected to do.
 *
 * This field is the reason the harness can tell a working protocol from a
 * broken one. Without it the orchestrator sees a revert and has no way to know
 * whether the protocol correctly refused something, or wrongly refused
 * something legitimate — and a refusal that should have happened but did not
 * is exactly as much a defect as an unexpected one.
 *
 * The revert case names the error selector rather than merely expecting
 * failure, because "it reverted" is satisfied by running out of gas.
 */
export type Expectation = { kind: 'success' } | { kind: 'revert'; error: string };

export interface PlannedAction {
  contract: `0x${string}`;
  functionName: string;
  args: readonly unknown[];
  expect: Expectation;
  /** Relative likelihood when the scheduler samples among an agent's actions. */
  weight: number;
  /** Short human description, carried into any finding this produces. */
  intent: string;
}

/**
 * What an agent can see before deciding.
 *
 * Deliberately a snapshot rather than a live client: an agent that could make
 * its own calls could observe state between its decision and its action, which
 * is not a position any real operator is in, and would let a policy be written
 * that no keeper could actually execute.
 */
export interface ProtocolState {
  blockTimestamp: bigint;
  vaults: readonly `0x${string}`[];
  /** Portfolio ids by status, so a policy can find work without scanning. */
  portfolios: {
    submitted: readonly bigint[];
    underReview: readonly bigint[];
    approved: readonly bigint[];
    active: readonly bigint[];
  };
  claims: {
    pending: readonly bigint[];
    approved: readonly bigint[];
  };
  /** Cedant that ceded each portfolio, so "another's book" can be found rather
   *  than assumed. Without it the foreign-claim perimeter cannot be expressed
   *  by an agent that signs as itself, and would produce a false permit. */
  portfolioCedant: ReadonlyMap<bigint, `0x${string}`>;
  /** Per-vault accounting, keyed by vault address. */
  accounting: ReadonlyMap<
    `0x${string}`,
    { totalAssets: bigint; totalShares: bigint; availableBuffer: bigint; deployed: bigint }
  >;
  /** True when the NAV feed for a vault is currently usable. */
  oracleFresh: ReadonlyMap<`0x${string}`, boolean>;
}

export interface Agent {
  /** Stable identity, e.g. "A3-allocator-01". Appears in every finding. */
  readonly id: string;
  readonly role: RoleId | null;
  /** The address this agent signs with. Never shared with another agent. */
  readonly address: `0x${string}`;

  /**
   * Actions this agent would take, given what it can see.
   *
   * Must be deterministic in `(state, rng)`: the same state and the same seed
   * produce the same plan. Anything else and a finding cannot be replayed,
   * which is the difference between a report and a story.
   */
  plan(state: ProtocolState, rng: Rng): PlannedAction[];

  /**
   * Checks this agent makes about its own effect on the world.
   *
   * Separate from the global invariants because they are cheaper and more
   * specific: the sentinel checks that no balance moved when it acted, and
   * does not need to know anything about premium accrual to do so.
   */
  localInvariants(before: ProtocolState, after: ProtocolState): Finding[];
}

/**
 * Picks one action from a weighted list.
 *
 * Weights are relative, not probabilities, so a policy can be written without
 * having to renormalise every time an action is added. Zero-weight actions are
 * never selected, which is how a scenario disables a behaviour without
 * removing it from the agent.
 */
export function pickWeighted(actions: PlannedAction[], rng: Rng): PlannedAction | undefined {
  const usable = actions.filter((a) => a.weight > 0);
  if (usable.length === 0) return undefined;

  const total = usable.reduce((sum, a) => sum + a.weight, 0);
  let target = rng.next() * total;

  for (const action of usable) {
    target -= action.weight;
    if (target <= 0) return action;
  }
  // Floating-point drift can leave the loop without a pick on the last step.
  return usable[usable.length - 1];
}
