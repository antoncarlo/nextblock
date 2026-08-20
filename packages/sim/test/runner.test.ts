import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { gradeOutcome, worstSeverity, runScenario, type ChainClient } from '../src/runner.ts';
import type { Agent, PlannedAction, ProtocolState } from '../src/agents/types.ts';
import { pickWeighted } from '../src/agents/types.ts';
import { makeRng } from '../src/risk/prng.ts';
import { emptyState } from '../src/shadow/ledger.ts';
import { SCENARIOS, PRIORITY_ORDER } from '../src/scenarios/index.ts';
import { BASE_SEPOLIA } from '../src/guards/chain-guard.ts';

const VAULT = '0x00000000000000000000000000000000000000f1' as `0x${string}`;
const ADDR_A = '0x0000000000000000000000000000000000000a01' as `0x${string}`;
const ADDR_B = '0x0000000000000000000000000000000000000b02' as `0x${string}`;

const REPRO = { seed: 'test-seed', index: 3, scenario: 'S1' };

function action(over: Partial<PlannedAction> = {}): PlannedAction {
  return {
    contract: VAULT,
    functionName: 'deposit',
    args: [1n],
    expect: { kind: 'success' },
    weight: 1,
    intent: 'an LP deposits',
    ...over,
  };
}

function emptyProtocolState(): ProtocolState {
  return {
    blockTimestamp: 1_000n,
    vaults: [VAULT],
    portfolios: { submitted: [], underReview: [], approved: [], active: [] },
    claims: { pending: [], approved: [] },
    accounting: new Map(),
    oracleFresh: new Map(),
  };
}

describe('grading an outcome', () => {
  test('an expected success that succeeds is not a finding', () => {
    const out = gradeOutcome('A11-lp', action(), { status: 'success', txHash: '0xabc' }, REPRO);
    assert.deepEqual(out, []);
  });

  test('an expected refusal that refuses correctly is not a finding', () => {
    const a = action({ expect: { kind: 'revert', error: 'Unauthorized' }, intent: 'a stranger deposits' });
    const out = gradeOutcome('A11-lp', a, { status: 'reverted', error: 'Unauthorized(0x…)' }, REPRO);
    assert.deepEqual(out, []);
  });

  test('a refusal that should not have happened is reported', () => {
    const out = gradeOutcome('A11-lp', action(), { status: 'reverted', error: 'InsufficientBuffer' }, REPRO);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.kind, 'REFUSED');
    assert.equal(out[0]?.severity, 'P2', 'a rejected legitimate action costs availability, not money');
  });

  test('a refusal that did not happen is the finding that costs money', () => {
    // The asymmetry the harness exists for: a missing revert and an unexpected
    // one look the same to anything that only watches for exceptions.
    const a = action({ expect: { kind: 'revert', error: 'UnauthorizedRole' }, intent: 'the sentinel approves a claim' });
    const out = gradeOutcome('A4-sentinel', a, { status: 'success', txHash: '0xdef' }, REPRO);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.kind, 'PERMITTED');
    assert.equal(out[0]?.severity, 'P1');
    assert.match(out[0]?.summary ?? '', /was permitted/);
  });

  test('the right refusal from the wrong check is recorded quietly', () => {
    // It reverted, so nothing is broken — but the check the action was written
    // to exercise still has never run.
    const a = action({ expect: { kind: 'revert', error: 'ConcentrationExceeded' }, intent: 'over-allocate' });
    const out = gradeOutcome('A3-allocator', a, { status: 'reverted', error: 'PortfolioNotAllocatable' }, REPRO);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.severity, 'P3');
    assert.match(out[0]?.summary ?? '', /different reason/);
  });

  test('replay coordinates and the call survive into the finding', () => {
    const out = gradeOutcome('A11-lp', action(), { status: 'reverted', error: 'nope' }, REPRO);
    assert.equal(out[0]?.repro.seed, 'test-seed');
    assert.equal(out[0]?.repro.actionIndex, 3);
    assert.equal(out[0]?.repro.functionName, 'deposit');
  });

  test('a private key in a revert string never reaches the finding', () => {
    const leaky = { status: 'reverted' as const, error: `failed signing with 0x${'a'.repeat(64)}` };
    const out = gradeOutcome('A11-lp', action(), leaky, REPRO);
    assert.ok(!out[0]?.observed?.includes('a'.repeat(64)));
    assert.match(out[0]?.observed ?? '', /\[redacted-key\]/);
  });
});

describe('weighted selection', () => {
  test('a zero weight is never selected', () => {
    // This is how a scenario disables a behaviour without deleting it.
    const rng = makeRng('weights');
    const actions = [action({ intent: 'off', weight: 0 }), action({ intent: 'on', weight: 1 })];
    for (let i = 0; i < 500; i++) {
      assert.equal(pickWeighted(actions, rng)?.intent, 'on');
    }
  });

  test('an all-zero list yields nothing rather than throwing', () => {
    const rng = makeRng('weights-none');
    assert.equal(pickWeighted([action({ weight: 0 })], rng), undefined);
  });

  test('weights bias the selection roughly as stated', () => {
    const rng = makeRng('weights-bias');
    const actions = [action({ intent: 'rare', weight: 1 }), action({ intent: 'common', weight: 9 })];
    let common = 0;
    for (let i = 0; i < 10_000; i++) {
      if (pickWeighted(actions, rng)?.intent === 'common') common += 1;
    }
    assert.ok(common > 8_600 && common < 9_400, `common was picked ${common} times in 10000`);
  });
});

describe('run guards', () => {
  const stubClient = (chainId: number): ChainClient => ({
    getChainId: async () => chainId,
    readState: async () => emptyProtocolState(),
    send: async () => ({ status: 'success', txHash: '0x0' }),
    readAccounting: async () => ({ balance: 0n, totalShares: 0n, sharePrice: 1_000_000n }),
  });

  const quietAgent = (id: string, address: `0x${string}`): Agent => ({
    id,
    role: null,
    address,
    plan: () => [],
    localInvariants: () => [],
  });

  const config = (agents: Agent[], chainId: number) => ({
    scenario: SCENARIOS.S1,
    seed: 'guard-test',
    chainId,
    agents,
    trackedVault: VAULT,
    maxActions: 5,
    shadow: emptyState(),
  });

  test('refuses to run against a production chain', async () => {
    await assert.rejects(
      () => runScenario(stubClient(8453), config([quietAgent('A1', ADDR_A)], 8453)),
      /Base mainnet/,
    );
  });

  test('refuses when two agents share an address', async () => {
    // The check that keeps the campaign meaningful: shared keys make every
    // separation invariant hold trivially.
    await assert.rejects(
      () =>
        runScenario(
          stubClient(BASE_SEPOLIA),
          config([quietAgent('A3', ADDR_A), quietAgent('A4', ADDR_A)], BASE_SEPOLIA),
        ),
      /share the address/,
    );
  });

  test('refuses when the endpoint disagrees with the configuration', async () => {
    await assert.rejects(
      () => runScenario(stubClient(31_337), config([quietAgent('A1', ADDR_A)], BASE_SEPOLIA)),
      /reports chain 31337/,
    );
  });

  test('a clean configuration runs and finds nothing', async () => {
    const result = await runScenario(
      stubClient(BASE_SEPOLIA),
      config([quietAgent('A3', ADDR_A), quietAgent('A4', ADDR_B)], BASE_SEPOLIA),
    );
    assert.deepEqual(result.findings, []);
    assert.equal(result.actionsAttempted, 0, 'agents with no plan cost a slot and nothing else');
    assert.equal(result.haltedEarly, false);
  });
});

describe('shadow divergence halts the run', () => {
  test('a balance that disagrees is P0 and stops everything', async () => {
    // Past a P0 the protocol is in a state it was never meant to reach, and
    // further findings describe that state rather than the defect.
    const client: ChainClient = {
      getChainId: async () => BASE_SEPOLIA,
      readState: async () => emptyProtocolState(),
      send: async () => ({ status: 'success', txHash: '0x1' }),
      readAccounting: async () => ({ balance: 12n, totalShares: 0n, sharePrice: 1_000_000n }),
    };

    const busyAgent: Agent = {
      id: 'A11-lp',
      role: null,
      address: ADDR_A,
      plan: () => [action()],
      localInvariants: () => [],
    };

    const result = await runScenario(client, {
      scenario: SCENARIOS.S1,
      seed: 'drift',
      chainId: BASE_SEPOLIA,
      agents: [busyAgent],
      trackedVault: VAULT,
      maxActions: 50,
      shadow: emptyState(), // expects a balance of zero
    });

    assert.equal(result.haltedEarly, true);
    assert.equal(result.actionsAttempted, 1, 'the run stops at the first divergence, not after fifty');
    assert.ok(result.findings.some((f) => f.kind === 'DRIFT' && f.severity === 'P0'));
  });
});

describe('worst severity', () => {
  test('reports the highest present', () => {
    assert.equal(worstSeverity([]), 'none');
    assert.equal(
      worstSeverity([
        { kind: 'REFUSED', severity: 'P2', summary: '', repro: { seed: '', actionIndex: 0, scenario: '' } },
        { kind: 'PERMITTED', severity: 'P1', summary: '', repro: { seed: '', actionIndex: 0, scenario: '' } },
      ]),
      'P1',
    );
  });
});

describe('scenarios', () => {
  test('every scenario states what would count as failure', () => {
    // A scenario that predicts nothing cannot be wrong, and a harness whose
    // scenarios cannot be wrong always agrees with itself.
    for (const s of Object.values(SCENARIOS)) {
      assert.ok(s.failureIs.length > 0, `${s.id} declares no failure condition`);
      assert.ok(s.expected.length > 0, `${s.id} declares no expectation`);
      assert.ok(s.rationale.length > 40, `${s.id} does not say why it is worth running`);
    }
  });

  test('the priority order covers every scenario exactly once', () => {
    assert.equal(new Set(PRIORITY_ORDER).size, Object.keys(SCENARIOS).length);
    for (const id of Object.keys(SCENARIOS)) {
      assert.ok(PRIORITY_ORDER.includes(id as never), `${id} is missing from the running order`);
    }
  });
});
