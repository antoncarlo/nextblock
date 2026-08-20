/**
 * Deterministic pseudo-random source.
 *
 * A simulation whose findings cannot be reproduced is a simulation that
 * produces anecdotes. Every draw in this package comes from here, seeded once
 * per run, so a counterexample can be replayed exactly by quoting its seed.
 *
 * xoshiro128** rather than `Math.random`: the platform generator is unseeded
 * and its algorithm is not fixed across engines, so the same run on two
 * machines would diverge. This one is a published, fixed algorithm with a
 * 2^128 period, which is far beyond anything a campaign will consume.
 */
export interface Rng {
  /** Uniform on [0, 1). */
  next(): number;
  /** Uniform integer on [lo, hi], inclusive. */
  int(lo: number, hi: number): number;
  /** A fresh stream derived from this one, for independent sub-processes. */
  fork(label: string): Rng;
}

/** Mixes a string into a 32-bit seed, so streams can be named rather than numbered. */
function hashLabel(label: string, seed: number): number {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** SplitMix32 — used only to expand a single seed into xoshiro's four words. */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export function makeRng(seed: number | string): Rng {
  const numericSeed = typeof seed === 'string' ? hashLabel(seed, 0) : seed >>> 0;
  const expand = splitmix32(numericSeed);

  let s0 = expand();
  let s1 = expand();
  let s2 = expand();
  let s3 = expand();
  // All-zero state is the one state xoshiro cannot leave.
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1;

  const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

  function nextUint32(): number {
    const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    return result;
  }

  return {
    next() {
      // 2^-32, giving a uniform on [0, 1) with 32 bits of resolution.
      return nextUint32() * 2.3283064365386963e-10;
    },
    int(lo: number, hi: number) {
      if (hi < lo) throw new Error(`Rng.int: empty range [${lo}, ${hi}]`);
      return lo + Math.floor(this.next() * (hi - lo + 1));
    },
    fork(label: string) {
      return makeRng(hashLabel(label, nextUint32()));
    },
  };
}

/**
 * Standard normal, Box–Muller.
 *
 * The polar form is avoided deliberately: it rejects samples, so the number of
 * uniforms consumed depends on the values drawn, and two runs that should be
 * identical could fall out of step. This form consumes exactly two uniforms
 * every time, which keeps the stream position a function of the call sequence
 * alone.
 */
export function standardNormal(rng: Rng): number {
  // u must be strictly positive: log(0) is -Infinity.
  const u = 1 - rng.next();
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Gamma(shape, 1), Marsaglia–Tsang.
 *
 * Needed for the negative binomial, which is a Poisson whose rate is itself
 * Gamma-distributed. Rejection-based, so it does consume a variable number of
 * draws; it is called from its own forked stream for that reason.
 */
export function gamma(rng: Rng, shape: number): number {
  if (shape <= 0) throw new Error(`gamma: shape must be positive, got ${shape}`);

  // Marsaglia–Tsang requires shape >= 1; below that, boost and scale back.
  if (shape < 1) {
    const g = gamma(rng, shape + 1);
    return g * Math.pow(rng.next(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  for (;;) {
    let x: number;
    let v: number;
    do {
      x = standardNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = rng.next();

    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
