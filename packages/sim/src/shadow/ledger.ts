/**
 * An independent account of what the vault should hold.
 *
 * The value of this file rests entirely on one discipline: it is written from
 * the specification, never from the Solidity. If it derived a quantity by
 * transcribing the contract's formula, then comparing the two would compare
 * the code with itself, and every bug present in both would be invisible while
 * the comparison reported perfect agreement.
 *
 * So the rules below are stated in the language of insurance accounting —
 * premium is earned over the period it covers, a reserve is money already
 * promised, capital deployed to underwriting is not available for redemption —
 * and the arithmetic follows from those statements. Where the contract and
 * this file disagree, the finding says which is wrong by naming the rule.
 *
 * Amounts are bigint in USDC's six decimals throughout. Floating point would
 * make the comparison approximate, and an approximate comparison against a
 * contract that is exact reports rounding as drift and drift as rounding.
 */

export interface PolicyEntry {
  policyId: bigint;
  /** Premium received for this policy. */
  premium: bigint;
  /** Coverage start, unix seconds. */
  inception: bigint;
  /** Coverage end, unix seconds. */
  expiry: bigint;
}

export interface ShadowState {
  /** USDC the vault holds, from deposits and premium, less payouts and fees taken. */
  balance: bigint;
  /** Shares outstanding. */
  totalShares: bigint;
  /** Capital committed to portfolios, by portfolio id. */
  allocated: Map<bigint, bigint>;
  /** Approved but unpaid claims. */
  claimReserve: bigint;
  /** Fees accrued and not yet swept. */
  accruedFees: bigint;
  policies: PolicyEntry[];
}

export function emptyState(): ShadowState {
  return {
    balance: 0n,
    totalShares: 0n,
    allocated: new Map(),
    claimReserve: 0n,
    accruedFees: 0n,
    policies: [],
  };
}

/**
 * Premium not yet earned, at time `now`.
 *
 * The rule, stated before any arithmetic: premium belongs to the period it
 * covers. On the day a policy incepts none of it has been earned; at expiry
 * all of it has; in between it accrues with time elapsed. Until it is earned
 * it is a liability — money held against cover still owed — and counting it as
 * yield would report a profit that has not happened and let an early redeemer
 * take capital that is reserved for a later claim.
 */
export function unearnedPremium(state: ShadowState, now: bigint): bigint {
  let total = 0n;

  for (const p of state.policies) {
    if (now >= p.expiry) continue; // fully earned
    if (now <= p.inception) {
      total += p.premium; // nothing earned yet
      continue;
    }

    const span = p.expiry - p.inception;
    if (span <= 0n) continue; // degenerate policy earns immediately

    const remaining = p.expiry - now;
    // Rounds down, so the unearned figure is never overstated. Overstating a
    // liability would understate totalAssets and quietly hand value to whoever
    // redeems next — rounding has a direction here, and it is against the
    // party being paid.
    total += (p.premium * remaining) / span;
  }

  return total;
}

/**
 * What the vault is worth to shareholders.
 *
 * Assets less liabilities: unearned premium is owed to cover still running,
 * approved claims are owed to cedants, accrued fees are owed to the manager.
 * Floors at zero rather than going negative — a vault cannot be worth less
 * than nothing to its holders; insolvency shows up as a share price that
 * cannot pay, not as a negative asset figure.
 */
export function totalAssets(state: ShadowState, now: bigint): bigint {
  const liabilities = unearnedPremium(state, now) + state.claimReserve + state.accruedFees;
  const net = state.balance - liabilities;
  return net > 0n ? net : 0n;
}

/**
 * Assets available to redeem today.
 *
 * Capital committed to underwriting is not available: it is standing behind
 * cover that has been sold. The buffer is what is left, and a redemption
 * beyond it has to wait rather than be met by withdrawing collateral from a
 * live treaty.
 */
export function availableBuffer(state: ShadowState, now: bigint): bigint {
  let deployed = 0n;
  for (const amount of state.allocated.values()) deployed += amount;

  const assets = totalAssets(state, now);
  return assets > deployed ? assets - deployed : 0n;
}

/**
 * Shares minted for a deposit.
 *
 * The virtual-share offset is part of the specification rather than an
 * implementation detail, so it belongs here: without it the first depositor
 * into an empty vault can donate assets directly, inflate the share price and
 * take the next depositor's capital through rounding. The offset makes that
 * attack cost more than it yields.
 *
 * Rounds down. The depositor receives no more than the arithmetic supports;
 * the remainder stays with the vault, which is to say with the other holders.
 */
export function sharesForDeposit(state: ShadowState, assets: bigint, now: bigint, decimalsOffset = 12n): bigint {
  const virtualShares = 10n ** decimalsOffset;
  return (assets * (state.totalShares + virtualShares)) / (totalAssets(state, now) + 1n);
}

/**
 * Assets owed for a redemption. The mirror of `sharesForDeposit`, rounding in
 * the same direction — against the party being paid.
 */
export function assetsForRedeem(state: ShadowState, shares: bigint, now: bigint, decimalsOffset = 12n): bigint {
  const virtualShares = 10n ** decimalsOffset;
  return (shares * (totalAssets(state, now) + 1n)) / (state.totalShares + virtualShares);
}

/**
 * Value of one share, in USDC decimals: 1_000_000 is par.
 *
 * Stated the way the product states it — net assets divided by shares
 * outstanding, par when no shares exist — rather than as a ratio of the
 * conversion factors. The first version of this returned basis points and was
 * dimensionally wrong: assets carry six decimals and shares eighteen, so the
 * integer division collapsed to zero on any vault small enough to matter, and
 * the empty-vault branch it guarded could never be reached because the virtual
 * share count is never zero.
 *
 * The virtual offset is deliberately absent here. It exists to price a
 * *conversion* safely against an inflation attack; it is not part of what a
 * share is worth, and folding it into the reported price would report a number
 * no holder could realise.
 */
export function sharePrice(state: ShadowState, now: bigint, shareDecimals = 18n): bigint {
  if (state.totalShares === 0n) return PAR;
  return (totalAssets(state, now) * 10n ** shareDecimals) / state.totalShares;
}

/** One share at par, in USDC decimals. */
export const PAR = 1_000_000n;

/** One basis point of par, which is the share-price comparison tolerance. */
export const ONE_BPS = PAR / 10_000n;

export interface Divergence {
  field: string;
  expected: bigint;
  observed: bigint;
  /** Absolute difference, always non-negative. */
  delta: bigint;
}

/**
 * Compares the model with the chain.
 *
 * The balance tolerance is zero: USDC is an integer quantity and there is no
 * such thing as a rounding difference in a token transfer. A single wei of
 * disagreement means one of the two is not tracking something, and which
 * single wei it is has never once been the interesting question.
 *
 * The share-price tolerance is one basis point of par — a hundred units at six
 * decimals — because the two sides arrive at the figure through different
 * orders of operation and integer division is not associative.
 */
export function compare(
  expected: { balance: bigint; totalShares: bigint; sharePrice: bigint },
  observed: { balance: bigint; totalShares: bigint; sharePrice: bigint },
): Divergence[] {
  const out: Divergence[] = [];
  const abs = (x: bigint) => (x < 0n ? -x : x);

  if (expected.balance !== observed.balance) {
    out.push({
      field: 'balance',
      expected: expected.balance,
      observed: observed.balance,
      delta: abs(expected.balance - observed.balance),
    });
  }

  if (expected.totalShares !== observed.totalShares) {
    out.push({
      field: 'totalShares',
      expected: expected.totalShares,
      observed: observed.totalShares,
      delta: abs(expected.totalShares - observed.totalShares),
    });
  }

  const priceDelta = abs(expected.sharePrice - observed.sharePrice);
  if (priceDelta > ONE_BPS) {
    out.push({
      field: 'sharePrice',
      expected: expected.sharePrice,
      observed: observed.sharePrice,
      delta: priceDelta,
    });
  }

  return out;
}
