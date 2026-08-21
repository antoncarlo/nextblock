import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertWritableChain,
  assertEndpointMatches,
  ChainGuardError,
  BASE_SEPOLIA,
  ANVIL,
} from '../src/guards/chain-guard.ts';
import { loadKey, assertDistinctSigners, redact, looksLikeKey, KeyGuardError } from '../src/guards/key-guard.ts';
import { classify, toJUnit, toReproTest, type Finding } from '../src/report/finding.ts';

describe('chain guard', () => {
  test('permits the two chains the harness may write to', () => {
    assert.doesNotThrow(() => assertWritableChain(BASE_SEPOLIA));
    assert.doesNotThrow(() => assertWritableChain(ANVIL));
  });

  test('refuses Base mainnet by name', () => {
    assert.throws(() => assertWritableChain(8453), (e: unknown) => {
      assert.ok(e instanceof ChainGuardError);
      assert.match(e.message, /Base mainnet/);
      return true;
    });
  });

  test('refuses Ethereum mainnet by name', () => {
    assert.throws(() => assertWritableChain(1), /Ethereum mainnet/);
  });

  test('refuses an unknown chain rather than assuming it is a testnet', () => {
    // The allowlist is the point: a blocklist is wrong by default until
    // somebody remembers to update it.
    assert.throws(() => assertWritableChain(999_999), /not on the permitted list/);
  });

  test('catches an endpoint that disagrees with its configuration', () => {
    // A URL and a chain id are separate configuration and nothing stops them
    // diverging. Without this the guard checks a number in a file while the
    // transactions go somewhere else.
    const client = { getChainId: async () => 8453 };
    return assert.rejects(() => assertEndpointMatches(client, BASE_SEPOLIA), /reports chain 8453/);
  });

  test('accepts an endpoint that agrees', async () => {
    const client = { getChainId: async () => BASE_SEPOLIA };
    await assert.doesNotReject(() => assertEndpointMatches(client, BASE_SEPOLIA));
  });

  test('refuses even a matching endpoint when the chain is not permitted', async () => {
    const client = { getChainId: async () => 8453 };
    await assert.rejects(() => assertEndpointMatches(client, 8453), /Base mainnet/);
  });
});

describe('key guard', () => {
  const VALID = '0x' + 'a'.repeat(64);

  test('loads a well-formed key', () => {
    process.env.TEST_KEY_OK = VALID;
    assert.equal(loadKey('TEST_KEY_OK'), VALID);
    delete process.env.TEST_KEY_OK;
  });

  test('accepts a key without the 0x prefix and normalises it', () => {
    process.env.TEST_KEY_BARE = 'b'.repeat(64);
    assert.equal(loadKey('TEST_KEY_BARE'), '0x' + 'b'.repeat(64));
    delete process.env.TEST_KEY_BARE;
  });

  test('an absent key names the variable and not a value', () => {
    delete process.env.TEST_KEY_MISSING;
    assert.throws(() => loadKey('TEST_KEY_MISSING'), /TEST_KEY_MISSING is not set/);
  });

  test('a malformed key is refused without echoing it', () => {
    process.env.TEST_KEY_BAD = 'not-a-key';
    assert.throws(() => loadKey('TEST_KEY_BAD'), (e: unknown) => {
      assert.ok(e instanceof KeyGuardError);
      // Error messages travel further than anything else in a system, so a
      // malformed secret must not appear in one.
      assert.ok(!e.message.includes('not-a-key'), 'the rejected value must not be echoed');
      return true;
    });
    delete process.env.TEST_KEY_BAD;
  });

  test('two agents sharing an address is refused', () => {
    // This is the change that would make the entire campaign meaningless:
    // every separation-of-duty invariant would hold trivially and report green.
    assert.throws(
      () =>
        assertDistinctSigners([
          { id: 'A3-allocator', address: '0xAbC0000000000000000000000000000000000001' },
          { id: 'A4-sentinel', address: '0xabc0000000000000000000000000000000000001' },
        ]),
      /share the address/,
    );
  });

  test('distinct addresses pass', () => {
    assert.doesNotThrow(() =>
      assertDistinctSigners([
        { id: 'A3-allocator', address: '0x0000000000000000000000000000000000000001' },
        { id: 'A4-sentinel', address: '0x0000000000000000000000000000000000000002' },
      ]),
    );
  });

  test('redaction removes key-shaped text from artefacts', () => {
    const leaked = `signing with ${VALID} now`;
    assert.ok(looksLikeKey(leaked));
    const clean = redact(leaked);
    assert.ok(!clean.includes('a'.repeat(64)));
    assert.match(clean, /\[redacted-key\]/);
  });

  test('redaction leaves ordinary text alone', () => {
    const text = 'allocated 250000 to portfolio 3';
    assert.equal(redact(text), text);
  });
});

describe('finding reporter', () => {
  const finding: Finding = {
    kind: 'PERMITTED',
    severity: 'P1',
    summary: 'the sentinel approved a claim',
    rule: 'I-24',
    agent: 'A4-sentinel-01',
    repro: { seed: 'campaign-9', actionIndex: 4_182, scenario: 'S3-bank-run', functionName: 'approveClaim' },
    expected: 'revert ClaimManager__UnauthorizedRole',
    observed: 'success',
  };

  test('anything that moves funds is top severity whatever its kind', () => {
    // The amount is a fact about this run; the reachability is a fact about
    // the protocol, and only the second one matters for the grade.
    assert.equal(classify('REFUSED', { movesFunds: true }), 'P0');
    assert.equal(classify('HARNESS', { isAuthority: true }), 'P0');
  });

  test('the default grades follow the kind', () => {
    assert.equal(classify('DRIFT', {}), 'P0');
    assert.equal(classify('PERMITTED', {}), 'P1');
    assert.equal(classify('INVARIANT', {}), 'P1');
    assert.equal(classify('REFUSED', {}), 'P2');
    assert.equal(classify('HARNESS', {}), 'P3');
  });

  test('JUnit marks only the serious findings as failures', () => {
    // A report where everything is a failure gets muted, and a muted report is
    // worth nothing.
    const xml = toJUnit([finding, { ...finding, severity: 'P3', kind: 'HARNESS' }]);
    assert.match(xml, /tests="2"/);
    assert.match(xml, /failures="1"/);
    assert.match(xml, /<failure type="PERMITTED"/);
    assert.match(xml, /<system-out>/);
  });

  test('JUnit escapes markup rather than emitting broken XML', () => {
    const nasty: Finding = { ...finding, summary: 'a < b && c > d "quoted"' };
    const xml = toJUnit([nasty]);
    assert.ok(!xml.includes('a < b &&'), 'raw markup must not reach the document');
    assert.match(xml, /&lt;/);
    assert.match(xml, /&amp;/);
  });

  test('the replay coordinates survive into the report', () => {
    const xml = toJUnit([finding]);
    assert.match(xml, /seed campaign-9/);
    assert.match(xml, /action 4182/);
  });

  test('the generated repro test is skipped until somebody finishes it', () => {
    // A stub that has to be completed is more honest than a green test nobody
    // wrote: the generator knows which call failed, not which of the thousands
    // of preceding actions mattered.
    const sol = toReproTest(finding);
    assert.match(sol, /vm\.skip\(true\)/);
    assert.match(sol, /seed campaign-9/);
    assert.match(sol, /approveClaim/);
    assert.match(sol, /Anton Carlo Santoro/);
    assert.ok(!/claude|anthropic|copilot/i.test(sol), 'generated code carries no tool attribution');
  });
});
