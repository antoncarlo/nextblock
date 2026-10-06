import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fromInvocation } from '../src/util/invocation.ts';

test('a relative path is resolved against the directory npm was invoked from', () => {
  const root = resolve('/repo');
  assert.equal(
    fromInvocation('contracts/deployments/31337-staging.json', { INIT_CWD: root }),
    resolve(root, 'contracts/deployments/31337-staging.json'),
  );
});

test('without npm it falls back to the working directory', () => {
  assert.equal(fromInvocation('a/b.json', {}), resolve(process.cwd(), 'a/b.json'));
});

test('an empty INIT_CWD is ignored rather than resolving against the filesystem root', () => {
  assert.equal(fromInvocation('a/b.json', { INIT_CWD: '' }), resolve(process.cwd(), 'a/b.json'));
});

test('an absolute path is left alone', () => {
  const abs = resolve('/somewhere/else/dep.json');
  assert.equal(fromInvocation(abs, { INIT_CWD: resolve('/repo') }), abs);
});
