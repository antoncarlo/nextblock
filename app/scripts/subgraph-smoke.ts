/**
 * Subgraph parser smoke checks (current-state, no network).
 *
 *   node --experimental-strip-types app/scripts/subgraph-smoke.ts
 *
 * Scope: the pure raw→typed parsers for the Goldsky RedemptionQueue subgraph
 * (string numerics → bigint, trailing-underscore meta fields) + the env URL
 * resolution. No HTTP.
 */

import {
  parseRequests,
  parseSettlements,
  parseClaims,
  getSubgraphUrl,
} from '../src/lib/subgraph.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

// Raw rows mimic Goldsky's response shape (numerics as strings).
const reqs = parseRequests([
  { epochId: '0', lp: '0xabc', shares: '100000000000000000000000', timestamp_: '1730000000', transactionHash_: '0xaa' },
]);
check('request epochId bigint', reqs[0].epochId === 0n);
check('request shares bigint', reqs[0].shares === 100_000n * 10n ** 18n);
check('request timestamp number', reqs[0].timestamp === 1730000000);
check('request txHash mapped', reqs[0].txHash === '0xaa');

const setts = parseSettlements([
  {
    epochId: '0',
    settledShares: '25000000000000000000000',
    settledAssets: '25000000',
    ratioBps: '2500',
    timestamp_: '1730600000',
    transactionHash_: '0xbb',
  },
]);
check('settlement settledAssets bigint', setts[0].settledAssets === 25_000_000n);
check('settlement ratioBps number', setts[0].ratioBps === 2500);

const claims = parseClaims([
  {
    epochId: '0',
    lp: '0xabc',
    assetsPaid: '24990000',
    sharesReturned: '75000000000000000000000',
    timestamp_: '1730600100',
    transactionHash_: '0xcc',
  },
]);
check('claim assetsPaid bigint', claims[0].assetsPaid === 24_990_000n);
check('claim sharesReturned bigint', claims[0].sharesReturned === 75_000n * 10n ** 18n);

// Empty + malformed boundaries.
check('empty parse', parseRequests([]).length === 0);
const bad = parseRequests([
  { epochId: 'x', lp: '0x', shares: 'y', timestamp_: 'z', transactionHash_: '0x' },
]);
check('malformed numerics -> 0n', bad[0].epochId === 0n && bad[0].shares === 0n);

// Default URL when env unset.
check('default subgraph url', getSubgraphUrl().startsWith('https://api.goldsky.com/'));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
