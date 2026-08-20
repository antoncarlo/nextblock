import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildRoster, makeAgent, type Addresses, type AgentSpec } from '../src/agents/roster.ts';
import type { ProtocolState } from '../src/agents/types.ts';
import { makeRng } from '../src/risk/prng.ts';

const a = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as `0x${string}`;

const ADDR: Addresses = {
  vault: a(1), allocator: a(2), claims: a(3), compliance: a(4), portfolios: a(5),
  navOracle: a(6), factory: a(7), timelock: a(8), distributor: a(9),
};

const SPECS: AgentSpec[] = [
  { id: 'A1-governance-01', role: 'OWNER', address: a(101) },
  { id: 'A2-curator-01', role: 'UNDERWRITING_CURATOR', address: a(102) },
  { id: 'A3-allocator-01', role: 'ALLOCATOR', address: a(103) },
  { id: 'A4-sentinel-01', role: 'SENTINEL', address: a(104) },
  { id: 'A5-committee-01', role: 'CLAIMS_COMMITTEE', address: a(105) },
  { id: 'A6-cedant-01', role: 'AUTHORIZED_CEDANT', address: a(106) },
  { id: 'A7-premium-01', role: 'PREMIUM_DEPOSITOR', address: a(107) },
  { id: 'A8-kyc-01', role: 'KYC_OPERATOR', address: a(108) },
  { id: 'A9-oracle-01', role: 'ORACLE', address: a(109) },
  { id: 'A10-factory-01', role: 'VAULT_FACTORY', address: a(110) },
  { id: 'A11-lp-01', role: null, address: a(111) },
  { id: 'A12-keeper-01', role: null, address: a(112) },
];

function busyState(): ProtocolState {
  return {
    blockTimestamp: 1_000n,
    vaults: [ADDR.vault],
    portfolios: { submitted: [1n], underReview: [2n], approved: [3n], active: [4n] },
    claims: { pending: [10n], approved: [11n] },
    accounting: new Map([[ADDR.vault, { totalAssets: 1_000n, totalShares: 1_000n, availableBuffer: 200n, deployed: 800n }]]),
    oracleFresh: new Map([[ADDR.vault, true]]),
  };
}

describe('roster', () => {
  test('all twelve families have a policy', () => {
    assert.doesNotThrow(() => buildRoster(SPECS, ADDR));
    assert.equal(buildRoster(SPECS, ADDR).length, 12);
  });

  test('an unknown family is refused rather than silently doing nothing', () => {
    // A silent no-op agent would sit in the roster contributing nothing while
    // the run reported full coverage.
    assert.throws(() => makeAgent({ id: 'A99-ghost', role: null, address: a(199) }, ADDR), /No policy/);
  });

  test('every agent plans something in a busy world', () => {
    const rng = makeRng('roster');
    for (const agent of buildRoster(SPECS, ADDR)) {
      assert.ok(agent.plan(busyState(), rng).length > 0, `${agent.id} planned nothing`);
    }
  });

  test('every agent declares at least one action it expects to be refused', () => {
    // An agent that only ever does permitted things tests nothing about the
    // perimeter, which is most of what this harness is for.
    const rng = makeRng('perimeter');
    for (const agent of buildRoster(SPECS, ADDR)) {
      const plan = agent.plan(busyState(), rng);
      const negatives = plan.filter((p) => p.expect.kind === 'revert');
      assert.ok(negatives.length > 0, `${agent.id} declares no negative perimeter`);
    }
  });

  test('every expected revert names a specific error, not just failure', () => {
    // "It reverted" is satisfied by running out of gas.
    const rng = makeRng('errors');
    for (const agent of buildRoster(SPECS, ADDR)) {
      for (const p of agent.plan(busyState(), rng)) {
        if (p.expect.kind === 'revert') {
          assert.ok(p.expect.error.length > 3, `${agent.id}: "${p.intent}" expects a vague revert`);
        }
      }
    }
  });

  test('planning is deterministic given the same seed', () => {
    const left = buildRoster(SPECS, ADDR).map((ag) => ag.plan(busyState(), makeRng('same')).map((p) => p.intent));
    const right = buildRoster(SPECS, ADDR).map((ag) => ag.plan(busyState(), makeRng('same')).map((p) => p.intent));
    assert.deepEqual(left, right, 'a plan that cannot be replayed makes its findings unreplayable too');
  });

  test('the allocator expects a refusal when the feed is stale', () => {
    const rng = makeRng('stale');
    const stale = { ...busyState(), oracleFresh: new Map([[ADDR.vault, false]]) };
    const agent = makeAgent(SPECS[2]!, ADDR);
    const deploy = agent.plan(stale, rng).find((p) => p.intent.includes('stale feed'));
    assert.ok(deploy, 'the allocator must still try when the feed is stale');
    assert.equal(deploy?.expect.kind, 'revert');
  });

  test('a risk-reducing role that shrinks the vault is a P0', () => {
    const agent = makeAgent(SPECS[3]!, ADDR); // sentinel
    const before = busyState();
    const after = {
      ...before,
      accounting: new Map([[ADDR.vault, { totalAssets: 900n, totalShares: 1_000n, availableBuffer: 100n, deployed: 800n }]]),
    };
    const findings = agent.localInvariants(before, after);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.severity, 'P0');
  });

  test('a role with no such restriction is not flagged for the same movement', () => {
    const agent = makeAgent(SPECS[10]!, ADDR); // an LP; redemptions shrink the vault legitimately
    const before = busyState();
    const after = {
      ...before,
      accounting: new Map([[ADDR.vault, { totalAssets: 900n, totalShares: 900n, availableBuffer: 100n, deployed: 800n }]]),
    };
    assert.deepEqual(agent.localInvariants(before, after), []);
  });
});
