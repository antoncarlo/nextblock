import type { Agent, PlannedAction, ProtocolState, RoleId } from './types.ts';
import type { Rng } from '../risk/prng.ts';
import type { Finding } from '../report/finding.ts';

/**
 * The twelve agents, as policies rather than as twelve classes.
 *
 * The specification asks for one class per agent. What each agent actually
 * differs by is its role, its address, and the list of actions it will
 * consider — everything else was going to be the same twelve times, and twelve
 * near-identical classes is twelve places to fix a bug in the planning loop.
 * So the varying part is data and the shared part is written once.
 *
 * Each policy declares what its agent would do and, for every action, what the
 * protocol is expected to do about it. That second half is the whole value:
 * a harness that only recorded what happened could not tell a correct refusal
 * from a wrong one.
 */

export interface Addresses {
  vault: `0x${string}`;
  allocator: `0x${string}`;
  claims: `0x${string}`;
  compliance: `0x${string}`;
  portfolios: `0x${string}`;
  navOracle: `0x${string}`;
  factory: `0x${string}`;
  timelock: `0x${string}`;
  distributor: `0x${string}`;
}

export interface AgentSpec {
  id: string;
  role: RoleId | null;
  address: `0x${string}`;
}

type Planner = (state: ProtocolState, rng: Rng, addr: Addresses, self: AgentSpec) => PlannedAction[];

/** Shorthand: an action the protocol is expected to accept. */
const ok = (
  contract: `0x${string}`,
  functionName: string,
  args: readonly unknown[],
  weight: number,
  intent: string,
): PlannedAction => ({ contract, functionName, args, expect: { kind: 'success' }, weight, intent });

/** Shorthand: an action the protocol is expected to refuse, and why. */
const denied = (
  contract: `0x${string}`,
  functionName: string,
  args: readonly unknown[],
  error: string,
  weight: number,
  intent: string,
): PlannedAction => ({ contract, functionName, args, expect: { kind: 'revert', error }, weight, intent });

const pick = <T>(xs: readonly T[], rng: Rng): T | undefined =>
  xs.length === 0 ? undefined : xs[rng.int(0, xs.length - 1)];

const PLANNERS: Record<string, Planner> = {
  /** A1 — governance, acting only through the timelock. */
  A1: (_state, rng, addr) => [
    ok(addr.timelock, 'schedule', [addr.vault, 0n, '0x', '0x', rng.int(1, 1e6), 3600n], 2, 'governance queues a parameter change'),
    ok(addr.timelock, 'execute', [addr.vault, 0n, '0x', '0x', rng.int(1, 1e6)], 2, 'governance executes a matured change'),
    // The one claim a timelock exists to make.
    denied(addr.timelock, 'execute', [addr.vault, 0n, '0x', '0x', rng.int(1, 1e6)], 'TimelockUnexpectedOperationState', 3, 'governance executes before the delay has run'),
    denied(addr.vault, 'withdraw', [1_000_000n], 'ERC4626ExceededMaxWithdraw', 2, 'governance withdraws LP capital'),
    denied(addr.claims, 'approveClaim', [0n, 1_000_000n], 'UnauthorizedRole', 2, 'governance approves a claim'),
  ],

  /** A2 — the underwriting curator. */
  A2: (state, rng, addr) => {
    const submitted = pick(state.portfolios.submitted, rng);
    const underReview = pick(state.portfolios.underReview, rng);
    const approved = pick(state.portfolios.approved, rng);
    const active = pick(state.portfolios.active, rng);

    return [
      ...(submitted !== undefined
        ? [
            ok(addr.portfolios, 'startReview', [submitted], 4, 'the curator takes a book into review'),
            // A book reaching ACTIVE from SUBMITTED has been underwritten by nobody.
            denied(addr.portfolios, 'activatePortfolio', [submitted], 'InvalidStatus', 2, 'the curator puts an unreviewed book on risk'),
          ]
        : []),
      ...(underReview !== undefined
        ? [
            ok(addr.portfolios, 'approvePortfolio', [underReview, rng.int(50, 3_000)], 4, 'the curator approves a book'),
            ok(addr.portfolios, 'rejectPortfolio', [underReview, 'outside appetite'], 1, 'the curator declines a book'),
          ]
        : []),
      ...(approved !== undefined ? [ok(addr.portfolios, 'activatePortfolio', [approved], 3, 'the curator puts a book on risk')] : []),
      ...(active !== undefined
        ? [
            denied(addr.allocator, 'proposeAllocation', [addr.vault, active, 100_000n], 'UnauthorizedRole', 2, 'the curator allocates capital'),
            denied(addr.portfolios, 'pausePortfolio', [active], 'UnauthorizedRole', 2, 'the curator pulls the sentinel lever'),
          ]
        : []),
    ];
  },

  /** A3 — the allocator. */
  A3: (state, rng, addr) => {
    const active = pick(state.portfolios.active, rng);
    if (active === undefined) return [];
    const fresh = state.oracleFresh.get(addr.vault) ?? true;

    return [
      // Whether this is allowed depends on the feed, which is exactly the
      // condition S4 exists to put under load.
      fresh
        ? ok(addr.allocator, 'proposeAllocation', [addr.vault, active, 50_000n], 6, 'the allocator deploys capital')
        : denied(addr.allocator, 'proposeAllocation', [addr.vault, active, 50_000n], 'OracleBlocked', 6, 'the allocator deploys against a stale feed'),
      ok(addr.allocator, 'proposeDeallocation', [addr.vault, active, 10_000n], 2, 'the allocator pulls capital back'),
      denied(addr.allocator, 'proposeAllocation', [addr.vault, active, 10_000_000_000n], 'ConcentrationExceeded', 3, 'the allocator exceeds the concentration limit'),
      denied(addr.claims, 'approveClaim', [0n, 1_000n], 'UnauthorizedRole', 1, 'the allocator approves a claim'),
    ];
  },

  /** A4 — the sentinel. Risk-reducing powers only. */
  A4: (state, rng, addr) => {
    const pending = pick(state.claims.pending, rng);
    const active = pick(state.portfolios.active, rng);

    return [
      ...(pending !== undefined
        ? [
            ok(addr.claims, 'freezeClaim', [pending], 4, 'the sentinel freezes a suspect claim'),
            ok(addr.claims, 'disputeClaim', [pending, 'anomaly'], 3, 'the sentinel disputes a claim'),
            denied(addr.claims, 'approveClaim', [pending, 1_000n], 'UnauthorizedRole', 3, 'the sentinel approves a claim'),
          ]
        : []),
      ...(active !== undefined ? [ok(addr.portfolios, 'pausePortfolio', [active], 2, 'the sentinel pauses a book')] : []),
      ok(addr.navOracle, 'pauseFeed', [addr.vault], 2, 'the sentinel pauses the feed'),
      // The line that separates an emergency brake from a key to the safe.
      denied(addr.vault, 'claimFees', [addr.vault], 'UnauthorizedCaller', 3, 'the sentinel sweeps fees'),
    ];
  },

  /** A5 — the claims committee. */
  A5: (state, rng, addr) => {
    const pending = pick(state.claims.pending, rng);
    if (pending === undefined) return [];

    return [
      ok(addr.claims, 'approveClaim', [pending, 10_000n], 5, 'the committee approves within the request'),
      ok(addr.claims, 'rejectClaim', [pending, 'not covered'], 3, 'the committee rejects a claim'),
      denied(addr.claims, 'approveClaim', [pending, 10_000_000_000n], 'AmountExceedsRequested', 3, 'the committee approves more than was asked'),
      denied(addr.claims, 'freezeClaim', [pending], 'UnauthorizedRole', 2, 'the committee pulls the sentinel lever'),
    ];
  },

  /** A6 — the ceding parties. */
  A6: (state, rng, addr, self) => {
    const active = pick(state.portfolios.active, rng);
    // A book this cedant did not cede — the only basis on which the foreign
    // claim can honestly be attempted. With a single cedant there is none, and
    // the action simply is not generated rather than firing against an own book
    // and reporting a false permit.
    const foreign = state.portfolios.active.find((pid) => {
      const owner = state.portfolioCedant.get(pid);
      return owner !== undefined && owner.toLowerCase() !== self.address.toLowerCase();
    });

    return [
      ok(addr.portfolios, 'submitPortfolio', [], 3, 'a cedant offers a new book'),
      ...(active !== undefined
        ? [
            ok(addr.claims, 'submitClaim', [addr.vault, active, 25_000n], 5, 'a cedant files a claim on its own book'),
            // A claim comfortably past any book's coverage. The books this
            // harness submits carry a 1,000,000 USDC limit; 1,000,000,000 USDC
            // is a thousand times that, so the refusal is the coverage ceiling
            // and not some smaller bound reached first.
            denied(addr.claims, 'submitClaim', [addr.vault, active, 1_000_000_000_000_000n], 'ExceedsCoverage', 3, 'a cedant claims above the coverage limit'),
          ]
        : []),
      // The most consequential denial in the protocol: a cedant able to claim on
      // a book it never ceded can drain a vault through exposure it never took on.
      ...(foreign !== undefined
        ? [denied(addr.claims, 'submitClaim', [addr.vault, foreign, 25_000n], 'NotPortfolioCedant', 4, "a cedant files on another's book")]
        : []),
    ];
  },

  /** A7 — the premium depositor. */
  A7: (_state, _rng, addr) => [
    ok(addr.distributor, 'distributePremium', [0n, 50_000n], 5, 'premium is paid in and split'),
    denied(addr.vault, 'withdraw', [50_000n], 'ERC4626ExceededMaxWithdraw', 3, 'the depositor takes premium back out'),
  ],

  /** A8 — the KYC operator. */
  A8: (_state, rng, addr) => [
    ok(addr.compliance, 'setKycExpiry', [], 4, 'an investor’s KYC lapses'),
    ok(addr.compliance, 'setWhitelist', [], 4, 'an investor’s whitelist entry is withdrawn'),
    ok(addr.compliance, 'setInvestorLimit', [rng.int(0, 10_000)], 2, 'an investor limit is tightened'),
    denied(addr.vault, 'claimFees', [addr.vault], 'UnauthorizedCaller', 2, 'the KYC operator moves funds'),
  ],

  /** A9 — the attesting node. */
  A9: (_state, rng, addr) => [
    ok(addr.navOracle, 'publishNav', [addr.vault, rng.int(900_000, 1_100_000), 9_000], 6, 'the node publishes an honest NAV'),
    // Accepted but flagged rather than reverted, per the contract's own
    // documentation — so it is expected to succeed and the anomaly is checked
    // by the invariant rather than by this expectation.
    ok(addr.navOracle, 'publishNav', [addr.vault, 9_000_000n, 9_000], 3, 'the node publishes a deviant NAV'),
    denied(addr.navOracle, 'publishNav', [addr.vault, 1_000_000n, 100], 'ConfidenceTooLow', 3, 'the node publishes below its own confidence floor'),
    denied(addr.claims, 'approveClaim', [0n, 1_000n], 'UnauthorizedRole', 2, 'the attestor decides a claim'),
  ],

  /**
   * A10 — the vault factory.
   *
   * Only the positive action lives here. "A stranger stands up a vault" was
   * removed deliberately: in this model an agent signs with its own identity,
   * and A10 must hold the curator role to create a vault at all, so an agent
   * that can sign the stranger action is by construction not a stranger. The
   * unauthorised-caller perimeter is a different actor's job, and it is already
   * proved exhaustively by the 315-cell NegativeAuthority matrix in Foundry —
   * expressing it here would only produce a false permit.
   */
  A10: (_state, rng, addr) => [
    ok(addr.factory, 'createVault', [rng.int(1_000, 5_000)], 1, 'the curator stands up a vault'),
  ],

  /**
   * A11 — institutional LPs.
   *
   * The negative half matters as much here as anywhere. An LP is the party the
   * compliance gate exists for, and a run in which investors only ever do
   * permitted things never asks whether the gate is load-bearing.
   */
  A11: (state, rng, addr) => {
    const accounting = state.accounting.get(addr.vault);
    // Comfortably past whatever the buffer holds, so the refusal comes from the
    // liquidity ceiling rather than from an empty position.
    const beyondBuffer = (accounting?.availableBuffer ?? 0n) + 1_000_000_000_000n;

    return [
      ok(addr.vault, 'deposit', [BigInt(rng.int(1_000, 500_000)) * 1_000_000n], 6, 'an LP subscribes'),
      ok(addr.vault, 'redeem', [BigInt(rng.int(1, 1_000)) * 1_000_000n], 4, 'an LP redeems'),
      // Capital committed to live cover is not redeemable on demand. If this
      // ever succeeds, the buffer is being met by pulling collateral out from
      // behind cover that has already been sold.
      denied(addr.vault, 'redeem', [beyondBuffer], 'ERC4626ExceededMaxRedeem', 3, 'an LP redeems beyond the buffer'),
      // The gate that makes these shares restricted rather than ordinary.
      denied(addr.vault, 'transfer', [addr.factory, 1n], 'ReceiverNotWhitelisted', 3, 'an LP sends shares to an ineligible holder'),
      denied(addr.vault, 'deposit', [1_000_000n], 'ReceiverNotWhitelisted', 2, 'an ineligible investor subscribes'),
    ];
  },

  /** A12 — the permissionless keeper. Holds no role at all. */
  A12: (state, rng, addr) => {
    const approved = pick(state.claims.approved, rng);
    const active = pick(state.portfolios.active, rng);
    return [
      ...(approved !== undefined
        ? [ok(addr.claims, 'executeClaim', [approved], 6, 'a keeper settles an approved claim')]
        : []),
      ...(state.claims.pending.length > 0
        ? [
            denied(addr.claims, 'executeClaim', [state.claims.pending[0]], 'InvalidStatus', 3, 'a keeper settles a claim that was never approved'),
          ]
        : []),
      // Retiring a book is permissionless by design, and the adversarial case
      // is trying it early: the harness's books carry a long tenor, so an
      // attempt now must be refused for not having matured. That the keeper can
      // call it at all, and that calling it early changes nothing, is the point.
      ...(active !== undefined
        ? [denied(addr.portfolios, 'markExpired', [active], 'NotYetExpired', 3, 'a keeper retires a book before its cover has run out')]
        : []),
    ];
  },
};

/**
 * Builds an agent from its spec.
 *
 * The local invariants are the same shape for every agent and deliberately
 * narrow: an agent checks what it can see about its own effect. Anything that
 * needs a view of the whole protocol belongs in the global invariants, where
 * it is stated once instead of twelve times in twelve slightly different ways.
 */
export function makeAgent(spec: AgentSpec, addr: Addresses): Agent {
  const family = spec.id.split('-')[0] ?? '';
  const planner = PLANNERS[family];
  if (!planner) {
    throw new Error(`No policy for agent family "${family}". Known: ${Object.keys(PLANNERS).join(', ')}`);
  }

  return {
    id: spec.id,
    role: spec.role,
    address: spec.address,
    plan: (state, rng) => planner(state, rng, addr, spec),
    localInvariants: (before, after): Finding[] => {
      const findings: Finding[] = [];

      // Roles that may only reduce risk must never leave a vault holding less
      // than it did. Checked here rather than globally because the agent is the
      // only party that knows it just acted.
      if (spec.role === 'SENTINEL' || spec.role === 'KYC_OPERATOR' || spec.role === 'ORACLE') {
        for (const [vault, accountingAfter] of after.accounting) {
          const accountingBefore = before.accounting.get(vault);
          if (!accountingBefore) continue;
          if (accountingAfter.totalAssets < accountingBefore.totalAssets) {
            findings.push({
              kind: 'INVARIANT',
              severity: 'P0',
              summary: `${spec.role} acted and the vault's assets fell`,
              rule: 'role-separation',
              agent: spec.id,
              repro: { seed: 'local', actionIndex: -1, scenario: 'local-invariant' },
              expected: `totalAssets >= ${accountingBefore.totalAssets}`,
              observed: accountingAfter.totalAssets.toString(),
            });
          }
        }
      }

      return findings;
    },
  };
}

/** The full roster, one agent per family, each with its own address. */
export function buildRoster(specs: AgentSpec[], addr: Addresses): Agent[] {
  return specs.map((s) => makeAgent(s, addr));
}
