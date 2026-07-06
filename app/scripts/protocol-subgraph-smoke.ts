/**
 * Protocol-subgraph SDK smoke checks (pure, no network).
 *
 *   node --experimental-strip-types app/scripts/protocol-subgraph-smoke.ts
 *
 * Scope: raw→typed parsers for every entity, the _meta staleness verdict at
 * its boundaries, fail-stale behaviour on missing _meta, and endpoint
 * resolution (unset env → null, never a silent default).
 */

import {
  parseVaults,
  parseVaultFlows,
  parsePortfolios,
  parseClaims,
  parsePremiumFlows,
  parseNavPoints,
  parseProtocolEvents,
  parseComplianceAccounts,
} from '../src/lib/protocol-subgraph/entities.ts';
import {
  parseMeta,
  evaluateStaleness,
  getProtocolSubgraphUrl,
  DEFAULT_MAX_AGE_SECONDS,
} from '../src/lib/protocol-subgraph/client.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

// ─── Vault ───────────────────────────────────────────────────────────────────
const vaults = parseVaults([
  {
    id: '0xabc',
    name: 'NextBlock Balanced Core',
    symbol: 'nbRV-BC',
    displayName: 'Balanced Core',
    manager: '0xmgr',
    bufferRatioBps: '2000',
    managementFeeBps: '150',
    createdAt: '1781110200',
    depositCount: 3,
    withdrawCount: 1,
    totalDeposited: '150000000',
    totalWithdrawn: '25000000',
    premiumsRecorded: '9000000',
    claimsReserved: '1000000',
    claimsPaid: '500000',
    feesCollected: '20000',
  },
]);
check('vault address mapped', vaults[0].address === '0xabc');
check('vault buffer bps number', vaults[0].bufferRatioBps === 2000);
check('vault totalDeposited bigint', vaults[0].totalDeposited === 150_000_000n);
check('vault claimsPaid bigint', vaults[0].claimsPaid === 500_000n);

// ─── LP flows ────────────────────────────────────────────────────────────────
const flows = parseVaultFlows([
  {
    id: '0xaa-1',
    vault: { id: '0xabc' },
    owner: '0xlp',
    assets: '50000000',
    shares: '49000000000000000000',
    timestamp: '1781110300',
    txHash: '0xaa',
  },
]);
check('flow vault unwrapped', flows[0].vault === '0xabc');
check('flow assets bigint', flows[0].assets === 50_000_000n);
check('flow shares 18dec bigint', flows[0].shares === 49n * 10n ** 18n);

// ─── Portfolio ───────────────────────────────────────────────────────────────
const pfs = parsePortfolios([
  {
    id: '7',
    cedant: '0xced',
    structureType: 1,
    coverageLimit: '1000000000',
    cededPremium: '80000000',
    inceptionTime: '1781000000',
    expiryTime: '1812536000',
    status: 'ACTIVE',
    expectedLossBps: 450,
    vault: '0xabc',
    allocated: '200000000',
    premiumsReceivedGross: '40000000',
    submittedAt: '1780990000',
    updatedAt: '1781110000',
  },
]);
check('portfolio id bigint', pfs[0].portfolioId === 7n);
check('portfolio status union', pfs[0].status === 'ACTIVE');
check('portfolio allocated bigint', pfs[0].allocated === 200_000_000n);

// ─── Claim ───────────────────────────────────────────────────────────────────
const claims = parseClaims([
  {
    id: '3',
    portfolioId: '7',
    vault: '0xabc',
    claimant: '0xced',
    requestedAmount: '30000000',
    claimType: 2,
    status: 'PAID',
    anomalyFlagged: false,
    approvedAmount: '25000000',
    paidAmount: '25000000',
    reserved: '0',
    submittedAt: '1781050000',
    updatedAt: '1781100000',
  },
]);
check('claim paid amount bigint', claims[0].paidAmount === 25_000_000n);
check('claim reserved zeroed after payout', claims[0].reserved === 0n);
check('claim null approved handled', parseClaims([claims0Raw()])[0].approvedAmount === null);

function claims0Raw() {
  return {
    id: '4',
    portfolioId: '7',
    vault: '0xabc',
    claimant: '0xced',
    requestedAmount: '1',
    claimType: 0,
    status: 'SUBMITTED',
    anomalyFlagged: false,
    approvedAmount: null,
    paidAmount: null,
    reserved: '0',
    submittedAt: '1',
    updatedAt: '1',
  };
}

// ─── Premium flows ───────────────────────────────────────────────────────────
const pflows = parsePremiumFlows([
  { id: '0xbb-2', portfolioId: '7', kind: 'RECEIVED', counterparty: '0xced', amount: '40000000', timestamp: '1781110000', txHash: '0xbb' },
  { id: '0xbb-3', portfolioId: '0', kind: 'PROTOCOL_FEES_CLAIMED', counterparty: '0xowner', amount: '100000', timestamp: '1781110001', txHash: '0xbb' },
]);
check('premium flow kind union', pflows[0].kind === 'RECEIVED');
check('fee claim flow parsed', pflows[1].kind === 'PROTOCOL_FEES_CLAIMED' && pflows[1].amount === 100_000n);

// ─── NAV series ──────────────────────────────────────────────────────────────
const navs = parseNavPoints([
  { id: '0xcc-0', vault: '0xabc', nav: '151000000', confidenceBps: 9500, timestamp: '1781110400' },
]);
check('nav point bigint', navs[0].nav === 151_000_000n);
check('nav confidence number', navs[0].confidenceBps === 9500);

// ─── Activity feed ───────────────────────────────────────────────────────────
const events = parseProtocolEvents([
  { id: '0xdd-5', contract: 'ClaimManager', name: 'ClaimPaid', vault: '0xabc', portfolioId: '7', claimId: '3', actor: '0xced', amount: '25000000', timestamp: '1781100000', txHash: '0xdd' },
  { id: '0xdd-6', contract: 'PolicyRegistry', name: 'RealTimeLocked', vault: null, portfolioId: null, claimId: null, actor: null, amount: null, timestamp: '1781100001', txHash: '0xdd' },
]);
check('event ids linked', events[0].claimId === 3n && events[0].portfolioId === 7n);
check('event nulls preserved', events[1].claimId === null && events[1].amount === null);

// ─── Compliance ──────────────────────────────────────────────────────────────
const accounts = parseComplianceAccounts([
  { id: '0xlp', whitelisted: true, blocked: false, jurisdiction: 380, kycExpiry: '1812536000', investorLimit: '0', updatedAt: '1781000000' },
]);
check('compliance whitelisted', accounts[0].whitelisted === true);
check('compliance jurisdiction number', accounts[0].jurisdiction === 380);

// ─── Staleness verdicts ──────────────────────────────────────────────────────
const meta = parseMeta({ block: { number: 43600000, timestamp: 1781200000 }, hasIndexingErrors: false });
check('meta parsed', meta.blockNumber === 43600000 && !meta.hasIndexingErrors);

const fresh = evaluateStaleness(meta, 1781200000 + 60);
check('fresh under budget', fresh.stale === false && fresh.ageSeconds === 60);

const boundary = evaluateStaleness(meta, 1781200000 + DEFAULT_MAX_AGE_SECONDS);
check('boundary is not stale (inclusive budget)', boundary.stale === false);

const stale = evaluateStaleness(meta, 1781200000 + DEFAULT_MAX_AGE_SECONDS + 1);
check('past budget is stale', stale.stale === true);

const clock = evaluateStaleness(meta, 1781200000 - 30);
check('indexer ahead of clock clamps to 0', clock.ageSeconds === 0 && clock.stale === false);

const errMeta = parseMeta({ block: { number: 1, timestamp: 1781200000 }, hasIndexingErrors: true });
check('indexing errors force stale', evaluateStaleness(errMeta, 1781200000).stale === true);

const missing = parseMeta(null);
check('missing _meta treated as maximally stale', evaluateStaleness(missing, 1781200000).stale === true);

// ─── Endpoint resolution ─────────────────────────────────────────────────────
delete process.env.NEXT_PUBLIC_PROTOCOL_SUBGRAPH_URL;
check('unset endpoint resolves to null (no silent default)', getProtocolSubgraphUrl() === null);
process.env.NEXT_PUBLIC_PROTOCOL_SUBGRAPH_URL = 'https://example.test/subgraph';
check('set endpoint respected', getProtocolSubgraphUrl() === 'https://example.test/subgraph');

// ─── Verdict ─────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL PASS');
