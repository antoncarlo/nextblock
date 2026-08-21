import { gamma, type Rng } from './prng.ts';

/**
 * How many claims arrive in a period.
 *
 * Poisson is the default because claim arrivals in a reinsurance book are, to
 * a first approximation, independent events at a constant rate. Negative
 * binomial is offered for the case that approximation fails: real portfolios
 * are usually overdispersed — variance above the mean — because the rate
 * itself varies with weather, fraud waves and economic cycles. A model that
 * cannot express that will understate the tail, which is precisely the part a
 * reinsurer is paid to carry.
 */
export type FrequencyModel =
  | { kind: 'poisson'; lambda: number }
  | {
      kind: 'negative-binomial';
      /** Expected count per period. */
      lambda: number;
      /** Variance-to-mean ratio; must exceed 1 or this is just a Poisson. */
      dispersion: number;
    };

/**
 * Poisson draw.
 *
 * Knuth's product-of-uniforms method below lambda 30, which is exact. Above
 * that the method both slows down (its cost is linear in lambda) and, past
 * roughly lambda 700, underflows: exp(-lambda) becomes zero and the loop never
 * terminates.
 *
 * The split above 30 is exact rather than an approximation. A Poisson is
 * infinitely divisible — the sum of independent Poisson(lambda_i) is
 * Poisson(sum lambda_i) — so a large rate is drawn as the sum of several small
 * ones. A normal approximation would have been shorter and is what most
 * simulation code reaches for, but it is wrong in the tail, and the tail is
 * the entire subject here.
 */
export function drawPoisson(rng: Rng, lambda: number): number {
  if (lambda < 0) throw new Error(`drawPoisson: lambda must be non-negative, got ${lambda}`);
  if (lambda === 0) return 0;

  if (lambda > 30) {
    const parts = Math.ceil(lambda / 30);
    const each = lambda / parts;
    let total = 0;
    for (let i = 0; i < parts; i++) total += drawPoisson(rng, each);
    return total;
  }

  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng.next();
  } while (p > limit);
  return k - 1;
}

/**
 * Negative binomial, as a Poisson whose rate is Gamma-distributed.
 *
 * Parameterised by mean and variance-to-mean ratio rather than by (r, p),
 * because those are the quantities an underwriter can state about a book. The
 * conversion: variance = lambda * dispersion, so the Gamma has shape
 * lambda / (dispersion - 1) and scale (dispersion - 1).
 */
export function drawNegativeBinomial(rng: Rng, lambda: number, dispersion: number): number {
  if (lambda < 0) throw new Error(`drawNegativeBinomial: lambda must be non-negative, got ${lambda}`);
  if (dispersion <= 1) {
    throw new Error(
      `drawNegativeBinomial: dispersion must exceed 1 (got ${dispersion}); at or below 1 the distribution is not overdispersed and Poisson is the correct model`,
    );
  }
  if (lambda === 0) return 0;

  const shape = lambda / (dispersion - 1);
  const scale = dispersion - 1;
  const rate = gamma(rng, shape) * scale;
  return drawPoisson(rng, rate);
}

export function drawFrequency(rng: Rng, model: FrequencyModel): number {
  switch (model.kind) {
    case 'poisson':
      return drawPoisson(rng, model.lambda);
    case 'negative-binomial':
      return drawNegativeBinomial(rng, model.lambda, model.dispersion);
  }
}
