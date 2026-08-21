import { standardNormal, type Rng } from './prng.ts';

/**
 * How large a single claim is.
 *
 * A lognormal body with a generalised Pareto tail, spliced at a threshold.
 * This is the standard shape in non-life reinsurance and the reason is
 * structural rather than aesthetic: a single distribution fitted to the whole
 * range is dominated by the many small claims and systematically understates
 * the few large ones. Since a reinsurance layer is paid almost entirely out of
 * that upper region, a model that fits the body well and the tail badly is
 * fitted to the part nobody is exposed to.
 */
export interface SeverityModel {
  /** Log-scale location of the body. */
  mu: number;
  /** Log-scale dispersion of the body. */
  sigma: number;
  /** Value above which the Pareto tail takes over. */
  threshold: number;
  /**
   * Tail index. Above 0 the tail is heavy; at 1 the mean is already infinite,
   * so a fitted value near 1 is a statement that the book is uninsurable at
   * any finite premium rather than a number to pass through quietly.
   */
  xi: number;
  /** Scale of the tail beyond the threshold. */
  tailScale: number;
  /** Share of claims drawn from the tail rather than the body, 0..1. */
  tailProbability: number;
}

/** Lognormal draw: exp(mu + sigma * Z). */
export function drawLognormal(rng: Rng, mu: number, sigma: number): number {
  return Math.exp(mu + sigma * standardNormal(rng));
}

/**
 * Generalised Pareto beyond `threshold`, by inverse transform.
 *
 * For xi != 0: X = u + (scale / xi) * ((1 - p)^(-xi) - 1)
 * For xi == 0 the limit is exponential: X = u - scale * ln(1 - p)
 */
export function drawGeneralisedPareto(rng: Rng, threshold: number, scale: number, xi: number): number {
  if (scale <= 0) throw new Error(`drawGeneralisedPareto: scale must be positive, got ${scale}`);
  // Strictly below 1, so (1 - p) is never zero and the inverse is finite.
  const p = rng.next();

  if (Math.abs(xi) < 1e-12) {
    return threshold - scale * Math.log(1 - p);
  }
  return threshold + (scale / xi) * (Math.pow(1 - p, -xi) - 1);
}

/**
 * One claim amount, capped at the coverage limit.
 *
 * The cap is applied here rather than left to the caller because an uncapped
 * severity draw is not a claim: no portfolio pays above its limit, and letting
 * an unbounded figure travel further would produce findings about arithmetic
 * that could never occur on chain.
 */
export function drawSeverity(rng: Rng, model: SeverityModel, coverageLimit: number): number {
  const { mu, sigma, threshold, xi, tailScale, tailProbability } = model;

  if (tailProbability < 0 || tailProbability > 1) {
    throw new Error(`drawSeverity: tailProbability must lie in [0, 1], got ${tailProbability}`);
  }

  const fromTail = rng.next() < tailProbability;
  const raw = fromTail
    ? drawGeneralisedPareto(rng, threshold, tailScale, xi)
    : drawLognormal(rng, mu, sigma);

  // A body draw can land above the splice point by chance; that is not an
  // error, it is the two pieces overlapping, and the cap is what matters.
  return Math.min(Math.max(raw, 0), coverageLimit);
}

/**
 * Parameters for a moderately heavy commercial property book.
 *
 * Offered as a starting point, not as a fitted answer. Real parameters come
 * from a cedant's loss history; these exist so a scenario can run before that
 * history is available, and any finding produced under them should be read as
 * "the protocol behaves this way under these assumptions", never as a
 * statement about a real portfolio.
 */
export const DEFAULT_SEVERITY: SeverityModel = {
  mu: Math.log(20_000),
  sigma: 1.2,
  threshold: 250_000,
  xi: 0.35,
  tailScale: 180_000,
  tailProbability: 0.04,
};
