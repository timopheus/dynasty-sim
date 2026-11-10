import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TARGET, TERRAINS, buildMap } from '../tools/map-build';

/** M.1: the map of the screen is built from the Azgaar export, deterministic, and the file in the repository is fresh. */
describe('map data (M.1)', () => {
  const source = JSON.parse(readFileSync(join(import.meta.dirname, '../map/region.json'), 'utf8'));
  const built = buildMap(source) as {
    width: number; height: number; terrains: string[]; vx: number[];
    cells: { v: number[][]; t: number[]; s: number[]; p: number[] };
    states: { name: string; label: number[] | null }[];
    burgs: { name: string }[];
    rivers: unknown[]; routes: unknown[]; seas: unknown[];
  };

  it('is the same on every build, and the file in the repository is the fresh build', () => {
    expect(JSON.stringify(buildMap(source))).toBe(JSON.stringify(built));
    expect(readFileSync(TARGET, 'utf8')).toBe(`${JSON.stringify(built)}\n`);
  });

  it('has every cell with its corners, a known kind of land, and realms with a line for their names', () => {
    expect(built.width).toBe(1600);
    expect(built.terrains).toEqual([...TERRAINS]);
    const corners = built.vx.length / 2;
    for (const [i, vs] of built.cells.v.entries()) {
      expect(vs.length, `cell ${i}`).toBeGreaterThanOrEqual(3);
      for (const v of vs) expect(v).toBeLessThan(corners);
      expect(built.cells.t[i]).toBeGreaterThanOrEqual(0);
      expect(built.cells.t[i]).toBeLessThan(TERRAINS.length);
    }
    expect(built.states.length).toBe(7);
    for (const s of built.states) expect(s.label, s.name).toHaveLength(6);
    expect(built.burgs.length).toBeGreaterThan(100);
    expect(built.rivers.length).toBeGreaterThan(100);
    expect(built.routes.length).toBeGreaterThan(50);
  });

  it('names the towns of the places of the game (S.9 named the places after them)', () => {
    const places = readFileSync(join(import.meta.dirname, '../content/places.yaml'), 'utf8');
    const names = [...places.matchAll(/^\s+name: (.+)$/gm)].map((m) => (m[1] as string).trim()).filter((n) => !n.includes(' '));
    expect(names.length).toBeGreaterThanOrEqual(12);
    for (const n of names) expect(built.burgs.map((b) => b.name), n).toContain(n);
  });

  it('keeps the file small enough for the page', () => {
    expect(readFileSync(TARGET).length).toBeLessThan(1_000_000);
  });
});
