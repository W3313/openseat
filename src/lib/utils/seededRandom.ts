// Deterministic PRNG (mulberry32) and numeric helpers (`clamp`, used by the scoring module). The fictional
// dataset generator that drew from it was removed 2026-09-06; the generator stays for synthetic test data.

export interface SeededRandom {
  /** The seed this generator was created with. */
  readonly seed: number;
  /** Next raw 32-bit unsigned integer. */
  next(): number;
  /** Uniform float in [0, 1). */
  float(): number;
  /** Uniform integer in [lo, hi] — both ends inclusive. */
  int(lo: number, hi: number): number;
  /** Normal(mu, sigma) via Box–Muller (two uniforms per draw; the sine half is discarded). */
  normal(mu?: number, sigma?: number): number;
  /** Gamma(shape, scale) via Marsaglia–Tsang; shape < 1 uses the boost trick. */
  gamma(shape: number, scale?: number): number;
  /** Beta(a, b) as X / (X + Y) with X ~ Gamma(a), Y ~ Gamma(b). */
  beta(a: number, b: number): number;
  /** Uniform pick. Throws on an empty array. */
  pick<T>(arr: readonly T[]): T;
  /** Pick proportional to `weights` (same length as `arr`, non-negative, not all zero). */
  weightedPick<T>(arr: readonly T[], weights: readonly number[]): T;
  /** Bernoulli(p). */
  bool(p?: number): boolean;
  /** Poisson(lambda): Knuth for lambda < 30, rounded normal approximation above. */
  poisson(lambda: number): number;
  /** Binomial(n, p) by n Bernoulli draws (n is small in the seed). */
  binomial(n: number, p: number): number;
  /** Fisher–Yates shuffle into a new array. */
  shuffle<T>(arr: readonly T[]): T[];
}

/** mulberry32 — small, fast, well-distributed 32-bit generator. */
export function mulberry32(seed: number): SeededRandom {
  let a = seed >>> 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };

  const float = (): number => next() / 4294967296;

  const int = (lo: number, hi: number): number => {
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) throw new RangeError(`int(${lo}, ${hi})`);
    return lo + Math.floor(float() * (hi - lo + 1));
  };

  const normal = (mu = 0, sigma = 1): number => {
    const u1 = 1 - float(); // (0, 1] so Math.log never sees 0
    const u2 = float();
    return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const gamma = (shape: number, scale = 1): number => {
    if (!(shape > 0)) throw new RangeError(`gamma shape must be > 0, got ${shape}`);
    if (shape < 1) {
      // Gamma(a) = Gamma(a + 1) · U^(1/a)
      return gamma(shape + 1, scale) * Math.pow(float(), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number;
      let v: number;
      do {
        x = normal(0, 1);
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = float();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
    }
  };

  const beta = (alpha: number, b: number): number => {
    const x = gamma(alpha);
    const y = gamma(b);
    return x / (x + y);
  };

  const pick = <T>(arr: readonly T[]): T => {
    if (arr.length === 0) throw new RangeError('pick() on an empty array');
    return arr[Math.floor(float() * arr.length)];
  };

  const weightedPick = <T>(arr: readonly T[], weights: readonly number[]): T => {
    if (arr.length === 0 || arr.length !== weights.length) {
      throw new RangeError('weightedPick() needs equal, non-empty arr and weights');
    }
    let total = 0;
    for (const w of weights) {
      if (!(w >= 0)) throw new RangeError('weightedPick() weights must be non-negative');
      total += w;
    }
    if (total <= 0) throw new RangeError('weightedPick() weights sum to zero');
    let r = float() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i];
      if (r < 0) return arr[i];
    }
    return arr[arr.length - 1]; // float rounding fell off the end
  };

  const bool = (p = 0.5): boolean => float() < p;

  const poisson = (lambda: number): number => {
    if (!(lambda >= 0)) throw new RangeError(`poisson lambda must be >= 0, got ${lambda}`);
    if (lambda === 0) return 0;
    if (lambda >= 30) return Math.max(0, Math.round(normal(lambda, Math.sqrt(lambda))));
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= float();
    } while (p > limit);
    return k - 1;
  };

  const binomial = (n: number, p: number): number => {
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`binomial n must be a non-negative integer, got ${n}`);
    let successes = 0;
    for (let i = 0; i < n; i++) if (float() < p) successes++;
    return successes;
  };

  const shuffle = <T>(arr: readonly T[]): T[] => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(float() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  return { seed, next, float, int, normal, gamma, beta, pick, weightedPick, bool, poisson, binomial, shuffle };
}

/** Clamp helper used throughout the seed formulas (`clamp(normal(0, 0.28), −0.6, 0.6)`). */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Logistic function used for the would-take-again draw: sigmoid(1.6 · (quality − 3)). */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
