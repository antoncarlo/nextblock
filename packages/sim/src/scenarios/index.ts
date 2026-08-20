import type { RoleId } from '../agents/types.ts';

/**
 * The eight configurations the campaign runs.
 *
 * A scenario is not a script. It is a set of weights and a set of expectations:
 * what the agents are told to emphasise, and what the run is entitled to
 * conclude if the protocol behaves differently. Writing them as data rather
 * than as procedures means a scenario can be replayed, diffed against a
 * previous run, and argued with.
 *
 * `expectedFindings` is the part that carries the weight. A scenario that
 * predicts nothing cannot be wrong, and a harness whose scenarios cannot be
 * wrong is a harness that always agrees with itself.
 */

export type ScenarioId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8';

export interface Scenario {
  id: ScenarioId;
  name: string;
  /** Why this scenario is worth the machine time. */
  rationale: string;
  /** Simulated days the run covers. */
  simulatedDays: number;
  /** Multipliers applied to each agent's action weights, by agent prefix. */
  weights: Partial<Record<string, number>>;
  /** Conditions the scenario deliberately creates. */
  setup: string[];
  /** What the protocol must do. A deviation is a finding. */
  expected: string[];
  /** What would constitute a finding, stated before the run. */
  failureIs: string[];
  /** Roles deliberately given to one address, for the conflict scenario. */
  collidingRoles?: [RoleId, RoleId];
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  S1: {
    id: 'S1',
    name: 'Operational baseline',
    rationale:
      'The control. Without a run in which nothing unusual happens, there is no way to tell whether a finding in another scenario came from the stress or from the harness.',
    simulatedDays: 30,
    weights: {},
    setup: ['All agents at nominal weights', 'No induced anomaly'],
    expected: [
      'No findings',
      'NAV grows in step with net premium earned, not with premium received',
    ],
    failureIs: ['Any invariant broken', 'NAV that moves without a premium or claim behind it'],
  },

  S2: {
    id: 'S2',
    name: 'Catastrophe event',
    rationale:
      'A reinsurance protocol is bought for exactly this day. Everything else it does is bookkeeping until a large loss arrives and it has to pay.',
    simulatedDays: 7,
    weights: { A6: 6, A5: 3, A11: 0.5 },
    setup: [
      'A6 files claims worth 60-120% of the exposure allocated to one portfolio',
      'The whole cluster lands inside a 48-hour window',
    ],
    expected: [
      'Reserves are taken up to available capacity and no further',
      'The vault reflects the loss in its share price',
      'The redemption queue absorbs the pressure rather than the buffer going negative',
    ],
    failureIs: [
      'The vault pays out beyond totalAssets',
      'A reserve stays held after the claim behind it was rejected',
      'The buffer goes negative',
    ],
  },

  S3: {
    id: 'S3',
    name: 'Bank run',
    rationale:
      'The failure that has killed more funds than any loss event: everybody leaves at once, and the order they are served in decides who is made whole.',
    simulatedDays: 3,
    weights: { A11: 8, A3: 0.2 },
    setup: ['Every panic-archetype LP redeems within the same epoch'],
    expected: [
      'The buffer serves until exhausted',
      'The remainder queues and settles pro rata with ratioBps below 10000',
    ],
    failureIs: [
      'Two LPs exit the same epoch at different values per share',
      'The pro-rata does not sum to what was available',
      'Shares are burned without the corresponding assets leaving',
    ],
  },

  S4: {
    id: 'S4',
    name: 'Oracle outage',
    rationale:
      'The interesting half of an outage is not that risk-increasing actions stop. It is whether redemptions stop too, because a feed going quiet must not become a reason to hold an investor’s capital.',
    simulatedDays: 5,
    weights: { A9: 0, A3: 5, A11: 2 },
    setup: ['A9 stops publishing for longer than maxStaleness', 'A3 keeps attempting allocations'],
    expected: [
      'Every risk-increasing action reverts with OracleBlocked or StaleNav',
      'Redemptions remain possible throughout',
    ],
    failureIs: [
      'An allocation succeeds against a stale NAV',
      'A stale NAV also blocks the exit, which is capital trapped by an infrastructure fault',
    ],
  },

  S5: {
    id: 'S5',
    name: 'Malicious oracle',
    rationale:
      'An attestor is trusted by construction. What matters is how far that trust extends when the attestor is wrong on purpose.',
    simulatedDays: 5,
    weights: { A9: 8, A4: 3, A11: 2 },
    setup: [
      'A9 publishes NAV beyond maxDeviationBps',
      'Confidence is set at or below the published floor',
    ],
    expected: [
      'NavAnomalyDetected is emitted and the value is not applied',
      'A4 pauses the feed',
      'No allocation is made on the strength of the anomalous NAV',
    ],
    failureIs: [
      'A consumer accepts the anomalous NAV',
      'An LP enters or exits at a price derived from it',
    ],
  },

  S6: {
    id: 'S6',
    name: 'Compliance revoked on an open position',
    rationale:
      'The scenario with legal weight rather than technical weight. An expired date is an administrative fact, and a protocol that treats it like a sanctions hit has a contractual problem long before it has a bug.',
    simulatedDays: 10,
    weights: { A8: 6, A11: 3 },
    setup: ['A8 revokes the whitelist or lets KYC lapse on an LP holding a material position'],
    expected: [
      'The LP can neither add to the position nor receive transfers',
      'The LP keeps a route out',
    ],
    failureIs: [
      'The LP is left with no exit',
      'The LP can still deposit despite being ineligible',
    ],
  },

  S7: {
    id: 'S7',
    name: 'Role conflict',
    rationale:
      'Ranked first for a reason that has nothing to do with the code: staging today runs several roles from a single EOA. If the protocol tolerates that quietly, every separation invariant in the suite has been passing on an assumption nobody enforced.',
    simulatedDays: 5,
    weights: { A3: 3, A4: 3 },
    setup: ['One address is granted two conflicting roles'],
    expected: ['invariant_roleSeparation breaks immediately and the run halts with a P0'],
    failureIs: [
      'The run continues without a finding, which would mean the protocol accepts concentrated authority',
    ],
    collidingRoles: ['ALLOCATOR', 'SENTINEL'],
  },

  S8: {
    id: 'S8',
    name: 'Multi-vault competition',
    rationale:
      'Ranked second on the original reading that cedantExposure is per-vault and the aggregate would therefore be unbounded. That reading was checked and is wrong for percentage limits: if every vault satisfies e_i <= L * b_i then the aggregate ratio is at most L. It is right for absolute ceilings, which is why the allocator now aggregates over the factory registry. This scenario is what keeps that fix honest under load.',
    simulatedDays: 20,
    weights: { A10: 4, A3: 4, A6: 2 },
    setup: [
      'A10 stands up a second and third vault',
      'Every vault allocates to books ceded by the same counterparty',
    ],
    expected: [
      'Aggregate exposure to one cedant stays under the absolute ceiling',
      'Each vault stays under its own percentage limit',
    ],
    failureIs: [
      'The ceiling holds per vault but not in aggregate',
      'A vault outside the registry is counted toward the ceiling, or a registered one is missed',
    ],
  },
};

/**
 * Running order when time is short.
 *
 * S7 first because staging's single-EOA deployment makes it the likeliest to
 * find something real; S8 second because it guards a fix rather than a
 * hypothesis. S1 last: a baseline is only worth running once there is
 * something to compare it against.
 */
export const PRIORITY_ORDER: readonly ScenarioId[] = ['S7', 'S4', 'S3', 'S8', 'S2', 'S5', 'S6', 'S1'];

export function scenarioById(id: string): Scenario {
  const found = (SCENARIOS as Record<string, Scenario | undefined>)[id];
  if (!found) {
    throw new Error(`Unknown scenario "${id}". Known: ${Object.keys(SCENARIOS).join(', ')}`);
  }
  return found;
}
