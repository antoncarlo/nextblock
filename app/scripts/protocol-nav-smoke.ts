/**
 * Protocol NAV smoke checks (no network, no chain).
 *
 *   node --experimental-strip-types app/scripts/protocol-nav-smoke.ts
 *
 * The protocol NAV is the vault's own ERC-4626 accounting (balance less unearned premiums,
 * pending claims and accrued fees) turned into a NavOracle attestation, so the NAV feed does
 * not depend on an external model vendor. These checks pin what it may and may not publish.
 */

import {
  buildProtocolNav,
  PROTOCOL_NAV_CONFIDENCE_BPS,
  PROTOCOL_NAV_FORMULA_VERSION,
  type VaultNavInputs,
} from '../src/lib/protocol-nav.ts';
import { decideNavPublish } from '../src/lib/braino/client.ts';
import { sourceHash } from '../src/lib/oracle-node.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const VAULT = '0x47b1000000000000000000000000000000000BCa';

function inputs(over: Partial<VaultNavInputs> = {}): VaultNavInputs {
  return {
    vault: VAULT,
    chainId: 84532,
    blockNumber: 1_000_000n,
    blockTimestamp: 1_800_000_000,
    totalAssets: 900_000_000n,
    totalShares: 1_000_000_000_000_000_000_000n,
    balance: 1_000_000_000n,
    unearnedPremiums: 60_000_000n,
    pendingClaims: 30_000_000n,
    accumulatedFees: 10_000_000n,
    ...over,
  };
}

// 1. A consistent vault publishes its own totalAssets with full arithmetic confidence.
const ok = buildProtocolNav(inputs());
check('consistent vault is accepted', ok.ok === true);
if (ok.ok) {
  check('nav equals the vault totalAssets', ok.args.nav === 900_000_000n);
  check('confidence is the protocol constant', ok.args.confidenceBps === PROTOCOL_NAV_CONFIDENCE_BPS);
  check('vault is carried through', ok.args.vault.toLowerCase() === VAULT.toLowerCase());
  check('sourceHash is the keccak of the canonical report', ok.args.sourceHash === sourceHash(ok.report));
  check('report names the formula version', ok.report.formulaVersion === PROTOCOL_NAV_FORMULA_VERSION);
  check('report says it is not an actuarial valuation', String(ok.report.basis).includes('not an actuarial'));
  check('report carries bigints as decimal strings', ok.report.totalAssets === '900000000');
}

// 2. Deterministic: same inputs, same hash. Different block, different hash.
const again = buildProtocolNav(inputs());
check('same inputs give the same hash', ok.ok && again.ok && ok.args.sourceHash === again.args.sourceHash);
const later = buildProtocolNav(inputs({ blockNumber: 1_000_001n }));
check('a different block gives a different hash', ok.ok && later.ok && ok.args.sourceHash !== later.args.sourceHash);

// 3. Nothing to attest on an empty vault.
const empty = buildProtocolNav(inputs({ totalAssets: 0n, balance: 0n, unearnedPremiums: 0n, pendingClaims: 0n, accumulatedFees: 0n, totalShares: 0n }));
check('empty vault is not published', !empty.ok && empty.reason === 'empty');

// 4. A NAV above the net-of-liabilities balance is refused: it would overstate the vault.
const overstated = buildProtocolNav(inputs({ totalAssets: 950_000_000n }));
check('totalAssets above balance less liabilities is refused', !overstated.ok && overstated.reason === 'inconsistent');

// 5. Liabilities above the balance can only mean a zero NAV, never a positive one.
const underwater = buildProtocolNav(inputs({ balance: 50_000_000n, totalAssets: 1n }));
check('positive NAV on an underwater vault is refused', !underwater.ok && underwater.reason === 'inconsistent');

// 6. Malformed vault address.
const bad = buildProtocolNav(inputs({ vault: '0x1234' }));
check('malformed vault address is refused', !bad.ok && bad.reason === 'invalid_vault');

// 7. The keeper decision works unchanged on a protocol NAV.
if (ok.ok) {
  const first = decideNavPublish({
    newNav: ok.args.nav,
    lastNav: null,
    lastUpdatedAt: null,
    feedPaused: false,
    deviationWaiver: false,
    maxDeviationBps: 2_000n,
    nowSeconds: 1_800_000_000,
  });
  check('first protocol NAV is published', first.action === 'publish' && first.reason === 'first');
  const jump = decideNavPublish({
    newNav: ok.args.nav * 2n,
    lastNav: ok.args.nav,
    lastUpdatedAt: 1_799_999_000,
    feedPaused: false,
    deviationWaiver: false,
    maxDeviationBps: 2_000n,
    nowSeconds: 1_800_000_000,
  });
  check('a doubling is withheld by the deviation guard', jump.action === 'withhold' && jump.reason === 'deviation');
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nprotocol-nav smoke OK');
