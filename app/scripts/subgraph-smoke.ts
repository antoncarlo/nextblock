/**
 * Redemption-history parser smoke checks (current-state, no network).
 *
 *   node --experimental-strip-types app/scripts/subgraph-smoke.ts
 *
 * Scope: the pure raw-to-typed parsers for the redemption entities of the protocol
 * subgraph (string numerics to bigint, nested epoch and lp relations) and the env URL
 * resolution. No HTTP.
 */

import {
  parseRequests,
  parseSettlements,
  parseClaims,
  getSubgraphUrl,
  SETTLEMENTS_QUERY,
  LP_HISTORY_QUERY,
} from '../src/lib/subgraph.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

// Raw rows mimic the typed subgraph's response shape (numerics as strings,
// relations as nested objects).
const reqs = parseRequests([
  {
    epoch: { epochId: '0' },
    lp: { id: '0xabc' },
    shares: '100000000000000000000000',
    timestamp: '1730000000',
    txHash: '0xaa',
  },
]);
check('request epochId bigint', reqs[0].epochId === 0n);
check('request lp from the relation id', reqs[0].lp === '0xabc');
check('request shares bigint', reqs[0].shares === 100_000n * 10n ** 18n);
check('request timestamp number', reqs[0].timestamp === 1730000000);
check('request txHash mapped', reqs[0].txHash === '0xaa');

const setts = parseSettlements([
  {
    epochId: '0',
    settledShares: '25000000000000000000000',
    settledAssets: '25000000',
    ratioBps: '2500',
    settledAt: '1730600000',
  },
]);
check('settlement settledAssets bigint', setts[0].settledAssets === 25_000_000n);
check('settlement ratioBps number', setts[0].ratioBps === 2500);
check('settlement timestamp from settledAt', setts[0].timestamp === 1730600000);
check('settlement without a settledAt does not invent one', parseSettlements([
  { epochId: '1', settledShares: '0', settledAssets: '0', ratioBps: '0', settledAt: null },
])[0].timestamp === 0);

const claims = parseClaims([
  {
    epoch: { epochId: '0' },
    lp: { id: '0xabc' },
    assetsPaid: '24990000',
    sharesReturned: '75000000000000000000000',
    timestamp: '1730600100',
    txHash: '0xcc',
  },
]);
check('claim assetsPaid bigint', claims[0].assetsPaid === 24_990_000n);
check('claim sharesReturned bigint', claims[0].sharesReturned === 75_000n * 10n ** 18n);
check('claim epochId from the relation', claims[0].epochId === 0n);

// Empty + malformed boundaries.
check('empty parse', parseRequests([]).length === 0);
const bad = parseRequests([
  { epoch: { epochId: 'x' }, lp: { id: '0x' }, shares: 'y', timestamp: 'z', txHash: '0x' },
]);
check('malformed numerics -> 0n', bad[0].epochId === 0n && bad[0].shares === 0n);

// Queries target the typed entities, not the old per-event ones.
check(
  'queries use the typed entities',
  SETTLEMENTS_QUERY.includes('epoches') &&
    LP_HISTORY_QUERY.includes('redemptionRequests') &&
    LP_HISTORY_QUERY.includes('redemptionClaims') &&
    !LP_HISTORY_QUERY.includes('redemptionRequesteds'),
);

// No endpoint is invented: with the env unset there is none.
delete process.env.NEXT_PUBLIC_PROTOCOL_SUBGRAPH_URL;
check('no default subgraph url', getSubgraphUrl() === null);
process.env.NEXT_PUBLIC_PROTOCOL_SUBGRAPH_URL = 'https://example.test/subgraph';
check('url from the protocol subgraph env', getSubgraphUrl() === 'https://example.test/subgraph');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
