import { describe, expect, it } from 'vitest';
import { chain, smooth } from '../src/ui/map/geometry';

/** M.1: the sides of cells are joined into lines before they are drawn, so coasts and borders are smooth and unbroken. */
describe('map geometry (M.1)', () => {
  const p = (x: number, y: number) => ({ x, y });

  it('joins the sides of a square, given in any order and direction, into one closed ring', () => {
    const lines = chain([{ a: p(0, 0), b: p(1, 0) }, { a: p(1, 1), b: p(0, 1) }, { a: p(1, 0), b: p(1, 1) }, { a: p(0, 0), b: p(0, 1) }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.closed).toBe(true);
    expect(lines[0]?.points).toHaveLength(5);
  });

  it('joins an open run into one line from end to end, wherever it starts', () => {
    const lines = chain([{ a: p(1, 0), b: p(2, 0) }, { a: p(0, 0), b: p(1, 0) }, { a: p(2, 0), b: p(3, 0) }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.closed).toBe(false);
    expect(lines[0]?.points.map((q) => q.x)).toEqual([0, 1, 2, 3]);
  });

  it('smooths a corner and keeps the ends of an open line in place', () => {
    const out = smooth([p(0, 0), p(10, 0), p(10, 10)], false, 2);
    expect(out[0]).toEqual(p(0, 0));
    expect(out[out.length - 1]).toEqual(p(10, 10));
    expect(out.length).toBeGreaterThan(3);
    // the corner itself is cut
    expect(out.some((q) => q.x === 10 && q.y === 0)).toBe(false);
  });
});
