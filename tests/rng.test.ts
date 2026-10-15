import { describe, expect, it } from 'vitest';
import { chancePer, int, nextU32, pick, seedRng, weightedPick } from '../src/core/rng';

describe('rng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = seedRng(42);
    const b = seedRng(42);
    const seqA = Array.from({ length: 100 }, () => nextU32(a));
    const seqB = Array.from({ length: 100 }, () => nextU32(b));
    expect(seqA).toEqual(seqB);
  });

  it('gives different sequences for different seeds and streams', () => {
    const first = (r: ReturnType<typeof seedRng>) => Array.from({ length: 5 }, () => nextU32(r));
    expect(first(seedRng(1))).not.toEqual(first(seedRng(2)));
    expect(first(seedRng(1, 0))).not.toEqual(first(seedRng(1, 1)));
  });

  it('continues identically after a JSON round trip', () => {
    const r = seedRng(7);
    for (let i = 0; i < 10; i++) nextU32(r);
    const copy = JSON.parse(JSON.stringify(r)) as typeof r;
    expect(Array.from({ length: 20 }, () => nextU32(copy))).toEqual(Array.from({ length: 20 }, () => nextU32(r)));
  });

  it('keeps int() within inclusive bounds and hits both ends', () => {
    const r = seedRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = int(r, -2, 2);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThanOrEqual(2);
      seen.add(v);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
  });

  it('handles edge probabilities and weights', () => {
    const r = seedRng(5);
    for (let i = 0; i < 200; i++) {
      expect(chancePer(r, 0, 100)).toBe(false);
      expect(chancePer(r, 100, 100)).toBe(true);
    }
    expect(weightedPick(r, ['a', 'b'], (x) => (x === 'a' ? 1 : 1000000))).toBe('b');
    expect(() => pick(r, [])).toThrow();
    expect(() => int(r, 3, 2)).toThrow();
    expect(() => seedRng(-1)).toThrow();
    expect(() => seedRng(1.5)).toThrow();
  });
});
