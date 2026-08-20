import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyState,
  unearnedPremium,
  totalAssets,
  availableBuffer,
  sharesForDeposit,
  assetsForRedeem,
  sharePrice,
  PAR,
  ONE_BPS,
  compare,
  type ShadowState,
} from '../src/shadow/ledger.ts';

const USDC = (n: number) => BigInt(Math.round(n * 1_000_000));
const YEAR = 365n * 24n * 60n * 60n;

function stateWithPolicy(premium: bigint, inception: bigint, expiry: bigint): ShadowState {
  const s = emptyState();
  s.balance = premium;
  s.policies.push({ policyId: 1n, premium, inception, expiry });
  return s;
}

describe('unearned premium', () => {
  const premium = USDC(50_000);
  const start = 1_000_000n;
  const end = start + YEAR;

  test('nothing is earned at inception', () => {
    const s = stateWithPolicy(premium, start, end);
    assert.equal(unearnedPremium(s, start), premium);
  });

  test('half is earned at the midpoint', () => {
    const s = stateWithPolicy(premium, start, end);
    const mid = start + YEAR / 2n;
    const unearned = unearnedPremium(s, mid);
    // Integer division can leave the result one unit low; the direction is the
    // point, the exact unit is not.
    assert.ok(unearned <= premium / 2n && unearned >= premium / 2n - 1n, `unearned ${unearned}`);
  });

  test('all of it is earned at expiry', () => {
    const s = stateWithPolicy(premium, start, end);
    assert.equal(unearnedPremium(s, end), 0n);
    assert.equal(unearnedPremium(s, end + YEAR), 0n, 'and stays earned afterwards');
  });

  test('a policy that has not incepted is entirely unearned', () => {
    const s = stateWithPolicy(premium, start, end);
    assert.equal(unearnedPremium(s, start - 1n), premium);
  });

  test('rounding never overstates the liability', () => {
    // Overstating unearned premium understates totalAssets, which quietly
    // hands value to whoever redeems next. The rounding has a direction and it
    // is against the party being paid.
    const odd = 999_999_999n;
    const s = stateWithPolicy(odd, start, start + 7n);
    for (let t = start; t <= start + 7n; t++) {
      const exact = (odd * (start + 7n - t)) / 7n;
      assert.ok(unearnedPremium(s, t) <= exact + 1n);
    }
  });

  test('a zero-length policy earns immediately rather than dividing by zero', () => {
    const s = stateWithPolicy(premium, start, start);
    assert.equal(unearnedPremium(s, start), 0n);
  });
});

describe('total assets', () => {
  test('liabilities are subtracted, not netted against each other', () => {
    const s = emptyState();
    s.balance = USDC(1_000_000);
    s.claimReserve = USDC(200_000);
    s.accruedFees = USDC(50_000);
    assert.equal(totalAssets(s, 0n), USDC(750_000));
  });

  test('floors at zero rather than going negative', () => {
    const s = emptyState();
    s.balance = USDC(100);
    s.claimReserve = USDC(5_000);
    assert.equal(totalAssets(s, 0n), 0n, 'a vault cannot be worth less than nothing to its holders');
  });
});

describe('available buffer', () => {
  test('capital standing behind live cover is not available', () => {
    const s = emptyState();
    s.balance = USDC(1_000_000);
    s.allocated.set(1n, USDC(700_000));
    assert.equal(availableBuffer(s, 0n), USDC(300_000));
  });

  test('a fully deployed vault has no buffer', () => {
    const s = emptyState();
    s.balance = USDC(500_000);
    s.allocated.set(1n, USDC(500_000));
    assert.equal(availableBuffer(s, 0n), 0n);
  });

  test('over-deployment does not produce a negative buffer', () => {
    const s = emptyState();
    s.balance = USDC(400_000);
    s.allocated.set(1n, USDC(900_000));
    assert.equal(availableBuffer(s, 0n), 0n);
  });
});

describe('share arithmetic', () => {
  test('the virtual offset blunts the inflation attack on an empty vault', () => {
    const s = emptyState();
    // The classic setup: first depositor takes one share, then donates assets
    // directly so the next depositor's deposit rounds to zero shares.
    const firstShares = sharesForDeposit(s, 1n, 0n);
    assert.ok(firstShares > 0n, 'a one-unit deposit must still mint something');

    s.totalShares = firstShares;
    s.balance = USDC(10_000); // the donation

    const victim = sharesForDeposit(s, USDC(1_000), 0n);
    assert.ok(victim > 0n, 'a real deposit must not round to zero shares after a donation');
  });

  test('deposit and redeem round against the party being paid', () => {
    const s = emptyState();
    s.balance = USDC(1_000_000);
    s.totalShares = 1_000_000n * 10n ** 12n;

    const shares = sharesForDeposit(s, USDC(1_000), 0n);
    const back = assetsForRedeem({ ...s, totalShares: s.totalShares + shares, balance: s.balance + USDC(1_000) }, shares, 0n);

    assert.ok(back <= USDC(1_000), `a round trip must not create value: put in 1000, took out ${back}`);
  });

  test('share price on an empty vault is par', () => {
    assert.equal(sharePrice(emptyState(), 0n), PAR);
  });

  test('share price is net assets over shares, in USDC decimals', () => {
    const s = emptyState();
    s.balance = USDC(2_000_000);
    s.totalShares = 1_000_000n * 10n ** 18n;
    assert.equal(sharePrice(s, 0n), 2n * PAR, 'two USDC of assets per share reads as 2.00');
  });

  test('liabilities pull the price below par', () => {
    const s = emptyState();
    s.balance = USDC(1_000_000);
    s.claimReserve = USDC(250_000);
    s.totalShares = 1_000_000n * 10n ** 18n;
    assert.equal(sharePrice(s, 0n), (PAR * 3n) / 4n);
  });
});

describe('divergence', () => {
  const base = { balance: USDC(1_000), totalShares: 5n, sharePrice: PAR };

  test('agreement produces nothing', () => {
    assert.deepEqual(compare(base, base), []);
  });

  test('a single unit of balance is a divergence', () => {
    // Zero tolerance is deliberate: USDC is an integer quantity and there is
    // no such thing as a rounding difference in a token transfer.
    const out = compare(base, { ...base, balance: base.balance + 1n });
    assert.equal(out.length, 1);
    assert.equal(out[0]?.field, 'balance');
    assert.equal(out[0]?.delta, 1n);
  });

  test('share price tolerates one basis point but not more', () => {
    // The two sides reach it through different orders of integer division, so
    // exact equality would report arithmetic as a defect.
    assert.deepEqual(compare(base, { ...base, sharePrice: PAR + ONE_BPS }), []);
    assert.equal(compare(base, { ...base, sharePrice: PAR + ONE_BPS + 1n }).length, 1);
  });

  test('a share count that disagrees is always reported', () => {
    const out = compare(base, { ...base, totalShares: 6n });
    assert.equal(out.length, 1);
    assert.equal(out[0]?.field, 'totalShares');
  });
});
