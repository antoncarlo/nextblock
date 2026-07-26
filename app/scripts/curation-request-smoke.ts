/**
 * Smoke checks for the curation-request encoding.
 *
 *   node --experimental-strip-types app/scripts/curation-request-smoke.ts
 *
 * The value of this encoding is that the owner can verify what they are about
 * to sign, so the selector, the argument and the determinism of the label are
 * exactly what must not drift.
 */
import assert from 'node:assert/strict';
import { decodeFunctionData } from 'viem';
import {
  buildCurationRequest,
  buildCurationOperation,
  curationConsoleHref,
  curationLabel,
} from '../src/lib/governance/curation.ts';

const VAULT = '0x47b1F34b0f2BD9c8b8b1E4A1f7D4c9c0b3A5E6d7' as const;
const SYNDICATE = '0x1234567890AbcdEF1234567890aBcdef12345678' as const;
const OTHER = '0x000000000000000000000000000000000000dEaD' as const;

let checks = 0;
function check(name: string, fn: () => void) {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
}

// --- selector and argument ---

check('encodes assignSyndicate with the syndicate as its only argument', () => {
  const req = buildCurationRequest(VAULT, SYNDICATE);
  const decoded = decodeFunctionData({
    abi: [
      {
        type: 'function',
        name: 'assignSyndicate',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'syndicate', type: 'address' }],
        outputs: [],
      },
    ] as const,
    data: req.data,
  });
  assert.equal(decoded.functionName, 'assignSyndicate');
  assert.equal((decoded.args?.[0] as string).toLowerCase(), SYNDICATE.toLowerCase());
});

check('the call targets the vault, never the roles registry', () => {
  const req = buildCurationRequest(VAULT, SYNDICATE);
  assert.equal(req.vault, VAULT);
  const op = buildCurationOperation(VAULT, SYNDICATE);
  assert.equal(op.target, VAULT);
  assert.equal(op.value, 0n);
});

// --- determinism: the same request must always hash to the same salt ---

check('the label is deterministic and case-insensitive', () => {
  assert.equal(curationLabel(VAULT, SYNDICATE), curationLabel(VAULT.toLowerCase() as typeof VAULT, SYNDICATE));
  assert.equal(
    buildCurationOperation(VAULT, SYNDICATE).salt,
    buildCurationOperation(VAULT, SYNDICATE).salt,
  );
});

check('a different syndicate produces a different operation', () => {
  const a = buildCurationOperation(VAULT, SYNDICATE);
  const b = buildCurationOperation(VAULT, OTHER);
  assert.notEqual(a.data, b.data);
  assert.notEqual(a.salt, b.salt);
});

// --- the deep link carries the operation, not a free-text instruction ---

check('the console link round-trips target and calldata', () => {
  const href = curationConsoleHref(VAULT, SYNDICATE);
  const params = new URLSearchParams(href.slice(href.indexOf('?') + 1));
  assert.equal(params.get('kind'), 'raw');
  assert.equal(params.get('target'), VAULT);
  assert.equal(params.get('data'), buildCurationRequest(VAULT, SYNDICATE).data);
  assert.equal(params.get('label'), curationLabel(VAULT, SYNDICATE));
});

// --- the link must never carry an address the console would reject ---

check('addresses come out EIP-55 checksummed, whatever case went in', () => {
  const lower = VAULT.toLowerCase() as typeof VAULT;
  const req = buildCurationRequest(lower, SYNDICATE.toLowerCase() as typeof SYNDICATE);
  assert.equal(req.vault, VAULT);
  assert.equal(req.syndicate, SYNDICATE);
  // The console validates its target field with getAddress; a link that fed it
  // a non-checksummed address used to throw during render.
  const href = curationConsoleHref(lower, SYNDICATE);
  assert.equal(new URLSearchParams(href.slice(href.indexOf('?') + 1)).get('target'), VAULT);
});

check('a non-address is refused outright', () => {
  assert.throws(() => buildCurationRequest('0xnot-an-address' as typeof VAULT, SYNDICATE));
});

console.log(`\n${checks} checks passed.`);
