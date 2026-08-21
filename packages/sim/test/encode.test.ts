import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { encodeAction, ENCODABLE, type EncodeContext } from '../src/abi/encode.ts';
import { buildRoster, type Addresses, type AgentSpec } from '../src/agents/roster.ts';
import type { ProtocolState } from '../src/agents/types.ts';
import { makeRng } from '../src/risk/prng.ts';

const a = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as `0x${string}`;

const ADDR: Addresses = {
  vault: a(1), allocator: a(2), claims: a(3), compliance: a(4), portfolios: a(5),
  navOracle: a(6), factory: a(7), timelock: a(8), distributor: a(9),
};

const CTX: EncodeContext = { self: a(101), lpTarget: a(201), timestamp: 2_000_000_000n, salt: 42n };

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
    blockTimestamp: 2_000_000_000n,
    vaults: [ADDR.vault],
    portfolios: { submitted: [1n], underReview: [2n], approved: [3n], active: [4n] },
    claims: { pending: [10n], approved: [11n] },
    portfolioCedant: new Map(),
    accounting: new Map([[ADDR.vault, { totalAssets: 1_000_000_000_000n, totalShares: 1_000_000_000_000_000_000_000_000n, availableBuffer: 200_000_000_000n, deployed: 800_000_000_000n }]]),
    oracleFresh: new Map([[ADDR.vault, true]]),
  };
}

describe('encoding every action the roster produces', () => {
  test('every planned action of every agent encodes against the real ABI', () => {
    // This is the test the whole file exists for. If an agent names a function
    // the contracts do not expose, or supplies arguments that do not fit the
    // real signature, encodeFunctionData throws here — at build time, in
    // seconds, rather than as a page of harness findings after a live run.
    const rng = makeRng('encode-all');
    const stale = { ...busyState(), oracleFresh: new Map([[ADDR.vault, false]]) };

    for (const agent of buildRoster(SPECS, ADDR)) {
      const ctx = { ...CTX, self: agent.address };
      for (const state of [busyState(), stale]) {
        for (const action of agent.plan(state, rng)) {
          assert.doesNotThrow(
            () => encodeAction(action, ADDR, ctx),
            `${agent.id}: "${action.intent}" (${action.functionName}) does not encode`,
          );
        }
      }
    }
  });

  test('every encoding produces non-empty calldata with a selector', () => {
    const rng = makeRng('encode-data');
    for (const agent of buildRoster(SPECS, ADDR)) {
      const ctx = { ...CTX, self: agent.address };
      for (const action of agent.plan(busyState(), rng)) {
        const { data } = encodeAction(action, ADDR, ctx);
        // Four-byte selector plus whatever arguments: never the empty call that
        // would reach a fallback and revert for the wrong reason.
        assert.ok(data.length >= 10, `${action.functionName} produced ${data}`);
      }
    }
  });

  test('the claim call carries a type and an evidence hash the policy never mentioned', () => {
    // The discrepancy that motivated the file: the policy supplies three
    // arguments, the contract wants five.
    const action = {
      contract: ADDR.claims, functionName: 'submitClaim',
      args: [ADDR.vault, 4n, 25_000_000_000n], expect: { kind: 'success' as const },
      weight: 1, intent: 'a cedant files a claim',
    };
    const { data } = encodeAction(action, ADDR, CTX);
    // submitClaim(address,uint256,uint256,uint8,bytes32): five 32-byte words
    // after the selector.
    assert.equal(data.length, 10 + 5 * 64, 'the five-argument claim did not encode to five words');
  });

  test('a distinct salt gives a distinct evidence hash, so two claims never collide', () => {
    const action = {
      contract: ADDR.claims, functionName: 'submitClaim',
      args: [ADDR.vault, 4n, 1n], expect: { kind: 'success' as const },
      weight: 1, intent: 'claim',
    };
    const first = encodeAction(action, ADDR, { ...CTX, salt: 1n }).data;
    const second = encodeAction(action, ADDR, { ...CTX, salt: 2n }).data;
    assert.notEqual(first, second, 'two claims a run apart produced the same evidence hash');
  });

  test('the premium call is receivePremium, not the name the policy used', () => {
    const action = {
      contract: ADDR.distributor, functionName: 'distributePremium',
      args: [0n, 50_000_000_000n], expect: { kind: 'success' as const },
      weight: 1, intent: 'premium is paid in',
    };
    // If this threw, the roster would be naming a function the contract does
    // not have, and every premium action in a live run would be a false finding.
    assert.doesNotThrow(() => encodeAction(action, ADDR, CTX));
  });

  test('an unknown function stops the run rather than sending an empty call', () => {
    const action = {
      contract: ADDR.vault, functionName: 'flushTheBuffer',
      args: [], expect: { kind: 'success' as const }, weight: 1, intent: 'nonsense',
    };
    assert.throws(() => encodeAction(action, ADDR, CTX), /no encoding for/);
  });

  test('the encoder covers exactly the function names the roster uses — no more, no less', () => {
    // Drift in either direction is a bug: a roster function with no encoding is
    // a live-run crash, and an encoding for a function no agent calls is dead
    // code that will rot out of sync with the contract it claims to match.
    const rng = makeRng('coverage');
    const used = new Set<string>();
    for (const agent of buildRoster(SPECS, ADDR)) {
      const stale = { ...busyState(), oracleFresh: new Map([[ADDR.vault, false]]) };
      for (const state of [busyState(), stale]) {
        for (const action of agent.plan(state, rng)) used.add(action.functionName);
      }
    }

    for (const name of used) {
      assert.ok(ENCODABLE.has(name), `the roster uses "${name}" but the encoder has no case for it`);
    }
    for (const name of ENCODABLE) {
      assert.ok(used.has(name), `the encoder handles "${name}" but no agent calls it — dead code`);
    }
  });
});
