import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { makeRng, standardNormal, gamma } from '../src/risk/prng.ts';
import { drawPoisson, drawNegativeBinomial } from '../src/risk/frequency.ts';
import { drawSeverity, drawGeneralisedPareto, DEFAULT_SEVERITY } from '../src/risk/severity.ts';
import { cededLoss, applyAggregate, type TreatyStructure } from '../src/risk/treaty.ts';

/** Sample mean, for the statistical assertions below. */
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs: number[]): number {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

describe('prng', () => {
  test('the same seed produces the same sequence', () => {
    const a = makeRng('campaign-1');
    const b = makeRng('campaign-1');
    const left = Array.from({ length: 50 }, () => a.next());
    const right = Array.from({ length: 50 }, () => b.next());
    assert.deepEqual(left, right, 'a finding that cannot be replayed is an anecdote');
  });

  test('different seeds diverge', () => {
    const a = makeRng('campaign-1');
    const b = makeRng('campaign-2');
    assert.notEqual(a.next(), b.next());
  });

  test('draws stay inside [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      assert.ok(x >= 0 && x < 1, `draw out of range: ${x}`);
    }
  });

  test('forked streams are independent and reproducible', () => {
    const parent = makeRng('root');
    const first = parent.fork('agents').next();

    const parentAgain = makeRng('root');
    const firstAgain = parentAgain.fork('agents').next();

    assert.equal(first, firstAgain, 'a fork must be reproducible from the parent seed');
  });

  test('standard normal has the right first two moments', () => {
    const rng = makeRng('normal');
    const xs = Array.from({ length: 40_000 }, () => standardNormal(rng));
    assert.ok(Math.abs(mean(xs)) < 0.03, `mean drifted: ${mean(xs)}`);
    assert.ok(Math.abs(variance(xs) - 1) < 0.05, `variance drifted: ${variance(xs)}`);
  });

  test('gamma mean matches its shape', () => {
    const rng = makeRng('gamma');
    const shape = 4;
    const xs = Array.from({ length: 20_000 }, () => gamma(rng, shape));
    // Gamma(shape, 1) has mean = shape.
    assert.ok(Math.abs(mean(xs) - shape) < 0.15, `mean ${mean(xs)} is far from ${shape}`);
  });

  test('gamma handles shape below one', () => {
    const rng = makeRng('gamma-small');
    const xs = Array.from({ length: 20_000 }, () => gamma(rng, 0.4));
    assert.ok(Math.abs(mean(xs) - 0.4) < 0.05, `mean ${mean(xs)} is far from 0.4`);
    assert.ok(xs.every((x) => x >= 0));
  });
});

describe('frequency', () => {
  test('Poisson mean and variance both equal lambda', () => {
    const rng = makeRng('poisson');
    const lambda = 8;
    const xs = Array.from({ length: 40_000 }, () => drawPoisson(rng, lambda));
    assert.ok(Math.abs(mean(xs) - lambda) < 0.1, `mean ${mean(xs)}`);
    // Equidispersion is the defining property; if it fails the draw is not Poisson.
    assert.ok(Math.abs(variance(xs) - lambda) < 0.3, `variance ${variance(xs)}`);
  });

  test('the split above lambda 30 stays exact', () => {
    // The reason this matters: a normal approximation would pass a mean check
    // and fail in the tail, which is the only part a reinsurer is exposed to.
    const rng = makeRng('poisson-large');
    const lambda = 250;
    const xs = Array.from({ length: 20_000 }, () => drawPoisson(rng, lambda));
    assert.ok(Math.abs(mean(xs) - lambda) < 1.5, `mean ${mean(xs)}`);
    assert.ok(Math.abs(variance(xs) - lambda) < 12, `variance ${variance(xs)}`);
    assert.ok(xs.every((x) => Number.isInteger(x) && x >= 0));
  });

  test('lambda zero yields no claims', () => {
    const rng = makeRng('poisson-zero');
    assert.equal(drawPoisson(rng, 0), 0);
  });

  test('negative binomial is overdispersed', () => {
    const rng = makeRng('nb');
    const lambda = 10;
    const dispersion = 3;
    const xs = Array.from({ length: 40_000 }, () => drawNegativeBinomial(rng, lambda, dispersion));
    assert.ok(Math.abs(mean(xs) - lambda) < 0.2, `mean ${mean(xs)}`);
    // Variance should be lambda * dispersion. This is the whole reason the
    // model exists: a Poisson cannot express a book whose rate itself varies.
    assert.ok(Math.abs(variance(xs) - lambda * dispersion) < 3, `variance ${variance(xs)}`);
  });

  test('a dispersion of one is refused rather than silently accepted', () => {
    const rng = makeRng('nb-bad');
    assert.throws(() => drawNegativeBinomial(rng, 5, 1), /dispersion must exceed 1/);
  });
});

describe('severity', () => {
  test('never exceeds the coverage limit', () => {
    const rng = makeRng('severity');
    const limit = 500_000;
    for (let i = 0; i < 20_000; i++) {
      const x = drawSeverity(rng, DEFAULT_SEVERITY, limit);
      assert.ok(x >= 0 && x <= limit, `claim ${x} outside [0, ${limit}]`);
    }
  });

  test('the tail reaches further than the body', () => {
    const rng = makeRng('tail');
    const body = Array.from({ length: 5_000 }, () =>
      drawSeverity(rng, { ...DEFAULT_SEVERITY, tailProbability: 0 }, 1e12),
    );
    const tail = Array.from({ length: 5_000 }, () =>
      drawSeverity(rng, { ...DEFAULT_SEVERITY, tailProbability: 1 }, 1e12),
    );
    assert.ok(Math.max(...tail) > Math.max(...body), 'the Pareto tail must dominate the lognormal body');
  });

  test('a zero tail index gives the exponential limit', () => {
    const rng = makeRng('gpd-zero');
    const xs = Array.from({ length: 20_000 }, () => drawGeneralisedPareto(rng, 0, 100, 0));
    // Exponential(scale) has mean = scale.
    assert.ok(Math.abs(mean(xs) - 100) < 3, `mean ${mean(xs)}`);
  });

  test('an out-of-range tail probability is refused', () => {
    const rng = makeRng('severity-bad');
    assert.throws(() => drawSeverity(rng, { ...DEFAULT_SEVERITY, tailProbability: 1.5 }, 1000), /tailProbability/);
  });
});

describe('treaty', () => {
  test('quota share cedes its stated fraction', () => {
    const qs: TreatyStructure = { kind: 'quota-share', cessionBps: 2_500 };
    assert.equal(cededLoss(1_000_000, qs), 250_000);
    assert.equal(cededLoss(0, qs), 0);
  });

  test('excess of loss pays only between attachment and limit', () => {
    const xol: TreatyStructure = { kind: 'excess-of-loss', attachment: 100_000, limit: 400_000 };

    assert.equal(cededLoss(50_000, xol), 0, 'below the attachment the vault pays nothing');
    assert.equal(cededLoss(100_000, xol), 0, 'at the attachment exactly, still nothing');
    assert.equal(cededLoss(100_001, xol), 1, 'one unit above, one unit of cover');
    assert.equal(cededLoss(300_000, xol), 200_000, 'inside the layer, the excess');
    assert.equal(cededLoss(500_000, xol), 400_000, 'at the top of the layer, the full limit');
    assert.equal(cededLoss(9_000_000, xol), 400_000, 'above it, still the limit — the rest returns to the cedant');
  });

  test('surplus cedes in proportion to the risk, not to the loss', () => {
    // A risk of 1,000,000 with a retained line of 200,000 cedes 800,000 of
    // 1,000,000, so four fifths of every loss from it.
    const surplus: TreatyStructure = {
      kind: 'surplus',
      retainedLine: 200_000,
      lines: 9,
      sumInsured: 1_000_000,
    };
    assert.equal(cededLoss(100_000, surplus), 80_000);
    assert.equal(cededLoss(1_000_000, surplus), 800_000);
  });

  test('a risk at or below the line is not ceded at all', () => {
    const surplus: TreatyStructure = {
      kind: 'surplus',
      retainedLine: 200_000,
      lines: 9,
      sumInsured: 150_000,
    };
    assert.equal(cededLoss(150_000, surplus), 0);
  });

  test('surplus capacity caps the cession', () => {
    const surplus: TreatyStructure = {
      kind: 'surplus',
      retainedLine: 100_000,
      lines: 2, // 200,000 of capacity
      sumInsured: 1_000_000,
    };
    // Ceded portion is capped at 200,000 of 1,000,000, so a fifth.
    assert.equal(cededLoss(500_000, surplus), 100_000);
  });

  test('parametric pays on the index and ignores the loss', () => {
    const par: TreatyStructure = { kind: 'parametric', trigger: 120, payout: 750_000 };

    assert.equal(cededLoss(0, par, 130), 750_000, 'pays with no loss at all — this is basis risk, by design');
    assert.equal(cededLoss(5_000_000, par, 119), 0, 'and pays nothing on a large loss below trigger');
    assert.equal(cededLoss(1, par, 120), 750_000, 'the trigger is inclusive');
  });

  test('a negative gross loss is refused', () => {
    assert.throws(() => cededLoss(-1, { kind: 'quota-share', cessionBps: 5_000 }), /cannot be negative/);
  });

  test('an out-of-range cession is refused', () => {
    assert.throws(() => cededLoss(100, { kind: 'quota-share', cessionBps: 10_001 }), /cessionBps/);
  });

  test('aggregate features respond to accumulation', () => {
    // Many small losses, none of which would reach a per-claim attachment,
    // still exhaust an annual aggregate.
    assert.equal(applyAggregate(500_000, { deductible: 200_000 }), 300_000);
    assert.equal(applyAggregate(100_000, { deductible: 200_000 }), 0);
    assert.equal(applyAggregate(5_000_000, { deductible: 200_000, limit: 1_000_000 }), 1_000_000);
    assert.equal(applyAggregate(750_000, {}), 750_000);
  });
});
