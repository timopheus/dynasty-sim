/**
 * Seeded pseudo-random generator (sfc32, seeded via splitmix32).
 *
 * The state is a plain tuple of four 32-bit integers so it can live inside the
 * game state and survive a JSON save/load unchanged. Every random decision in
 * the simulation must go through these functions (see docs/DECISIONS.md, D-003).
 */
export type RngState = [number, number, number, number];

export const MAX_SEED = 0xffffffff;

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export function isValidSeed(seed: number): boolean {
  return Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED;
}

/** Creates a generator state. Different `stream` values give independent sequences for the same seed. */
export function seedRng(seed: number, stream = 0): RngState {
  if (!isValidSeed(seed)) throw new Error(`Seed must be an integer in 0..${MAX_SEED}, got ${seed}`);
  const next = splitmix32((seed ^ Math.imul(stream + 1, 0x632be5ab)) >>> 0);
  const state: RngState = [next(), next(), next(), next()];
  for (let i = 0; i < 12; i++) nextU32(state);
  return state;
}

/** Advances the state in place and returns an unsigned 32-bit integer. */
export function nextU32(r: RngState): number {
  const [a, b, c, d] = r;
  const t = (((a + b) | 0) + d) | 0;
  r[0] = b ^ (b >>> 9);
  r[1] = (c + (c << 3)) | 0;
  r[2] = (((c << 21) | (c >>> 11)) + t) | 0;
  r[3] = (d + 1) | 0;
  return t >>> 0;
}

/** Uniform integer in [lo, hi], both inclusive. */
export function int(r: RngState, lo: number, hi: number): number {
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) {
    throw new Error(`Invalid integer range [${lo}, ${hi}]`);
  }
  return lo + Math.floor((nextU32(r) / 0x100000000) * (hi - lo + 1));
}

/** True with probability n / d. */
export function chancePer(r: RngState, n: number, d: number): boolean {
  return int(r, 1, d) <= n;
}

export function pick<T>(r: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error('Cannot pick from an empty list');
  return items[int(r, 0, items.length - 1)] as T;
}

/** Picks an item with probability proportional to its integer weight (weights must be >= 1). */
export function weightedPick<T>(r: RngState, items: readonly T[], weight: (item: T) => number): T {
  if (items.length === 0) throw new Error('Cannot pick from an empty list');
  let total = 0;
  for (const item of items) total += weight(item);
  let roll = int(r, 1, total);
  for (const item of items) {
    roll -= weight(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1] as T;
}
