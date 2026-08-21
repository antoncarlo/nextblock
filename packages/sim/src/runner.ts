import type { Agent, PlannedAction, ProtocolState } from './agents/types.ts';
import { pickWeighted } from './agents/types.ts';
import { makeRng, type Rng } from './risk/prng.ts';
import { classify, type Finding } from './report/finding.ts';
import { assertWritableChain } from './guards/chain-guard.ts';
import { assertDistinctSigners, redact } from './guards/key-guard.ts';
import type { Scenario } from './scenarios/index.ts';
import { compare, sharePrice, type ShadowState } from './shadow/ledger.ts';

/**
 * What the runner needs from a chain.
 *
 * An interface rather than a viem client, so the loop below can be exercised
 * without a node. That is not only convenient: the orchestration logic — how
 * an unexpected success becomes a finding, how a shadow divergence is graded —
 * is the part most likely to be wrong, and it would be untestable if it could
 * only run against a funded staging deployment.
 *
 * Worth being precise about what needs keys, because an earlier version of this
 * comment was not. Foundry-level runs need none: the actors are deterministic
 * addresses from `makeAddr`. Fork-level runs need none either: real deployed
 * addresses are impersonated with `vm.startPrank`. Only staging on Base Sepolia
 * needs real signers, and there it is twenty-four of them — one per role, three
 * cedants rather than one so per-cedant concentration can bind, two keepers so
 * a permissionless settlement can be shown not to redirect a payout.
 *
 * The viem adapter lives outside this file and satisfies this shape.
 */
export interface ChainClient {
  getChainId(): Promise<number>;
  readState(): Promise<ProtocolState>;
  /**
   * Sends one action.
   *
   * Resolves with the outcome rather than throwing on revert: a revert is an
   * observation here, not an error, and half the actions in a campaign are
   * meant to produce one.
   */
  send(
    from: `0x${string}`,
    action: PlannedAction,
  ): Promise<
    | { status: 'success'; txHash: `0x${string}` }
    | { status: 'reverted'; error: string; txHash?: `0x${string}` }
  >;
  /** On-chain figures for the shadow comparison, for one vault. */
  readAccounting(vault: `0x${string}`): Promise<{ balance: bigint; totalShares: bigint; sharePrice: bigint }>;
}

export interface RunConfig {
  scenario: Scenario;
  seed: string;
  chainId: number;
  agents: Agent[];
  /** Vault the shadow ledger tracks. Multi-vault scenarios track the first. */
  trackedVault: `0x${string}`;
  /** Hard ceiling on actions, so a run cannot become unbounded. */
  maxActions: number;
  /** Independent expectation of the tracked vault's books. */
  shadow: ShadowState;
}

export interface RunResult {
  runId: string;
  scenario: string;
  seed: string;
  actionsAttempted: number;
  findings: Finding[];
  /** True when the run stopped early because of a P0. */
  haltedEarly: boolean;
}

/**
 * Runs one scenario to completion, or to its first unrecoverable finding.
 *
 * The loop is deliberately dull: observe, plan, act, compare, record. All the
 * judgement lives in the agents' policies and in the expectations they declare,
 * which is where it can be read and disagreed with. A scheduler that made
 * decisions of its own would be a thirteenth agent nobody specified.
 */
export async function runScenario(client: ChainClient, config: RunConfig): Promise<RunResult> {
  // Guards first, before a single transaction. Both would be cheap to check
  // per-action and are checked once instead: a check that runs a thousand
  // times is a check somebody eventually makes optional for speed.
  assertWritableChain(config.chainId);
  await assertEndpointAgrees(client, config.chainId);
  assertDistinctSigners(config.agents.map((a) => ({ id: a.id, address: a.address })));

  const runId = `${new Date().toISOString()}-${config.seed}`;
  const rng = makeRng(config.seed);
  const findings: Finding[] = [];
  let actionsAttempted = 0;
  let haltedEarly = false;

  for (let index = 0; index < config.maxActions; index++) {
    const before = await client.readState();

    const agent = config.agents[rng.int(0, config.agents.length - 1)];
    if (!agent) break;

    const action = pickWeighted(agent.plan(before, rng), rng);
    // An agent with nothing to do is normal: the sentinel has no work in a
    // quiet market. It costs one slot and the loop moves on.
    if (!action) continue;

    actionsAttempted += 1;
    const outcome = await client.send(agent.address, action);

    findings.push(...gradeOutcome(agent.id, action, outcome, { seed: config.seed, index, scenario: config.scenario.id }));

    const after = await client.readState();
    findings.push(...agent.localInvariants(before, after));

    findings.push(
      ...(await gradeShadow(client, config, { seed: config.seed, index, scenario: config.scenario.id })),
    );

    // A P0 means either money moved wrongly or the books disagree. Continuing
    // past that produces findings about a state the protocol was never
    // supposed to reach, which are noise dressed as evidence.
    if (findings.some((f) => f.severity === 'P0')) {
      haltedEarly = true;
      break;
    }
  }

  return { runId, scenario: config.scenario.id, seed: config.seed, actionsAttempted, findings, haltedEarly };
}

type Repro = { seed: string; index: number; scenario: string };

/**
 * Turns one action's outcome into findings.
 *
 * The two interesting cases are symmetric and easy to conflate. An action that
 * was meant to be refused and succeeded is a hole in the perimeter. An action
 * that was meant to work and reverted is a liveness problem. A harness that
 * only noticed unexpected reverts would miss the first entirely, which is the
 * one that costs money.
 */
export function gradeOutcome(
  agentId: string,
  action: PlannedAction,
  outcome: { status: 'success'; txHash: `0x${string}` } | { status: 'reverted'; error: string; txHash?: `0x${string}` },
  repro: Repro,
): Finding[] {
  const base = {
    agent: agentId,
    repro: {
      seed: repro.seed,
      actionIndex: repro.index,
      scenario: repro.scenario,
      contract: action.contract,
      functionName: action.functionName,
      args: action.args as unknown[],
    },
    txHash: outcome.txHash,
  };

  if (action.expect.kind === 'success') {
    if (outcome.status === 'success') return [];
    return [
      {
        ...base,
        kind: 'REFUSED',
        severity: classify('REFUSED', {}),
        summary: `${action.intent} was refused`,
        expected: 'success',
        observed: redact(outcome.error),
      },
    ];
  }

  if (outcome.status === 'success') {
    return [
      {
        ...base,
        kind: 'PERMITTED',
        severity: classify('PERMITTED', {}),
        summary: `${action.intent} was permitted`,
        expected: `revert ${action.expect.error}`,
        observed: 'success',
      },
    ];
  }

  // It reverted, as intended — but with the wrong error. Worth reporting at a
  // low grade rather than passing silently: the refusal came from somewhere
  // other than the check the action was written to exercise, so that check has
  // still never been tested.
  if (!outcome.error.includes(action.expect.error)) {
    return [
      {
        ...base,
        kind: 'REFUSED',
        severity: 'P3',
        summary: `${action.intent} was refused for a different reason than expected`,
        expected: `revert ${action.expect.error}`,
        observed: redact(outcome.error),
      },
    ];
  }

  return [];
}

/** Compares the shadow ledger with the chain and grades any divergence. */
async function gradeShadow(client: ChainClient, config: RunConfig, repro: Repro): Promise<Finding[]> {
  const observed = await client.readAccounting(config.trackedVault);
  const state = await client.readState();

  const expected = {
    balance: config.shadow.balance,
    totalShares: config.shadow.totalShares,
    sharePrice: sharePrice(config.shadow, state.blockTimestamp),
  };

  return compare(expected, observed).map((d) => ({
    kind: 'DRIFT' as const,
    // Always P0: either the contract is wrong or the model is, and until that
    // is settled no other number from this run can be trusted.
    severity: classify('DRIFT', {}),
    summary: `${d.field} diverged from the independent ledger by ${d.delta}`,
    agent: 'shadow-ledger',
    repro: { seed: repro.seed, actionIndex: repro.index, scenario: repro.scenario },
    expected: d.expected.toString(),
    observed: d.observed.toString(),
  }));
}

async function assertEndpointAgrees(client: ChainClient, expected: number): Promise<void> {
  const actual = await client.getChainId();
  if (actual !== expected) {
    throw new Error(
      `The endpoint reports chain ${actual} but the run is configured for ${expected}. ` +
        `Refusing to continue: the chain guard would have been applied to the configured value ` +
        `while the transactions went to the reported one.`,
    );
  }
  assertWritableChain(actual);
}

/** Highest severity present, for a run's exit code. */
export function worstSeverity(findings: Finding[]): 'P0' | 'P1' | 'P2' | 'P3' | 'none' {
  for (const level of ['P0', 'P1', 'P2', 'P3'] as const) {
    if (findings.some((f) => f.severity === level)) return level;
  }
  return 'none';
}
