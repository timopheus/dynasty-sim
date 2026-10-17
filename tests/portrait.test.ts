import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/hooks';
import { faceSpec, VARIANTS, type FaceSpec, type Part } from '../src/core/looks';
import { INK, PAPER, headwearKind, PORTRAIT_HEIGHT, PORTRAIT_WIDTH, SHADES, gridRgba, pixelsOf, portraitGrid, portraitText, type Grid } from '../src/ui/portrait';
import { BASE_FILES, loadOrThrow } from './fixtures/content';
import { anatomy as anatomyOf } from '../src/ui/portrait/anatomy';

const p = (variant = 0, dx = 0, dy = 0): Part => ({ variant, dx, dy });

/** A plain man of 35: every detail at variant 0 and no shift. */
function base(over: Partial<FaceSpec> = {}): FaceSpec {
  return {
    sex: 'male', age: 35, stage: 'adult', dead: false, expression: 'neutral', headWidth: 0, headHeight: 0,
    head: p(), eyes: p(), brows: p(), nose: p(), mouth: p(), ears: p(), hair: p(), grey: 0, beard: null, wrinkles: null,
    scars: [], bandages: [], eyepatch: null, accessories: [], illness: 0, beauty: 0, temper: 0, attire: 1, era: null,
    ...over,
  };
}

function rowsOf(g: Grid, part: string): number[] {
  return [...new Set(pixelsOf(g, part).map((i) => Math.floor(i / g.width)))];
}
function colsOf(g: Grid, part: string): number[] {
  return [...new Set(pixelsOf(g, part).map((i) => i % g.width))];
}
const key = (g: Grid) => g.shades.join('');
const mean = (g: Grid, idx: number[]) => idx.reduce((a, i) => a + g.shades[i]!, 0) / Math.max(1, idx.length);

describe('portrait grid (4.12, D-300)', () => {
  it('is a pure function of the spec: the same spec gives the same pixels', () => {
    expect(portraitGrid(base())).toEqual(portraitGrid(base()));
  });

  it('mixes two colours only, in many shades, without holes', () => {
    const g = portraitGrid(base({ attire: 3, accessories: [{ slot: 'head', ...p() }, { slot: 'ear', ...p() }], beard: p(), wrinkles: { ...p(), level: 3 } }));
    expect(g.shades).toHaveLength(PORTRAIT_WIDTH * PORTRAIT_HEIGHT);
    expect(g.shades.every((v) => Number.isInteger(v) && v >= 0 && v < SHADES)).toBe(true);
    // smooth shading uses most of the ramp
    expect(new Set(g.shades).size).toBeGreaterThanOrEqual(SHADES - 2);
    // every colour lies on the line from the ink to the paper
    const rgba = gridRgba(g);
    for (let i = 0; i < rgba.length; i += 4) {
      const t = (rgba[i]! - INK[0]) / (PAPER[0] - INK[0]);
      for (const c of [1, 2]) expect(Math.abs(rgba[i + c]! - (INK[c]! + (PAPER[c]! - INK[c]!) * t))).toBeLessThanOrEqual(1.5);
      expect(rgba[i + 3]).toBe(255);
    }
  });

  it('puts every detail in its place: hair above the brows, brows above the eyes, then nose, mouth, clothes', () => {
    const g = portraitGrid(base());
    const top = (part: string) => Math.min(...rowsOf(g, part));
    const bottom = (part: string) => Math.max(...rowsOf(g, part));
    for (const part of ['hair', 'brows', 'eyes', 'mouth', 'attire', 'head', 'ears', 'neck']) expect(pixelsOf(g, part).length, part).toBeGreaterThan(0);
    expect(top('hair')).toBeLessThan(top('brows'));
    expect(bottom('brows')).toBeLessThan(bottom('eyes'));
    // the nose lies between the eyes and the mouth
    expect(bottom('eyes') + 4).toBeLessThan(top('mouth'));
    expect(bottom('mouth')).toBeLessThan(top('attire'));
    // eyes on both sides of the middle, mirrored
    const eyes = colsOf(g, 'eyes');
    const mid = PORTRAIT_WIDTH / 2;
    expect(eyes.filter((x) => x < mid).map((x) => PORTRAIT_WIDTH - 1 - x).sort()).toEqual(eyes.filter((x) => x >= mid).sort());
  });

  it('every variant of every detail draws differently (D-301: at least three each)', () => {
    const details = ['head', 'eyes', 'brows', 'nose', 'mouth', 'ears', 'hair'] as const;
    for (const d of details) {
      const n = VARIANTS[d];
      const looks = new Set(Array.from({ length: n }, (_, v) => key(portraitGrid(base({ [d]: p(v) })))));
      expect(looks.size, d).toBe(n);
    }
    for (const [d, n] of [['beard', VARIANTS.beard], ['wrinkles', VARIANTS.wrinkles]] as const) {
      const looks = new Set(Array.from({ length: n }, (_, v) => key(portraitGrid(base({ [d]: d === 'wrinkles' ? { ...p(v), level: 3 } : p(v) })))));
      expect(looks.size, d).toBe(n);
    }
    for (const n of [VARIANTS.scars, VARIANTS.bandages]) expect(n).toBeGreaterThanOrEqual(3);
    const scars = new Set(Array.from({ length: VARIANTS.scars }, (_, v) => key(portraitGrid(base({ scars: [p(v)] })))));
    const bandages = new Set(Array.from({ length: VARIANTS.bandages }, (_, v) => key(portraitGrid(base({ bandages: [p(v)] })))));
    const hats = new Set(Array.from({ length: VARIANTS.headwear }, (_, v) => key(portraitGrid(base({ attire: 2, accessories: [{ slot: 'head', ...p(v) }] })))));
    expect([scars.size, bandages.size, hats.size]).toEqual([VARIANTS.scars, VARIANTS.bandages, VARIANTS.headwear]);
  });

  it('shifts move a detail', () => {
    const a = portraitGrid(base({ eyes: p(0, 0, -1) }));
    const b = portraitGrid(base({ eyes: p(0, 0, 1) }));
    const row = (g: Grid) => pixelsOf(g, 'eyes').reduce((s, i) => s + Math.floor(i / PORTRAIT_WIDTH), 0) / pixelsOf(g, 'eyes').length;
    expect(row(b)).toBeGreaterThan(row(a));
    for (const d of ['head', 'nose', 'mouth', 'brows', 'hair'] as const) expect(key(portraitGrid(base({ [d]: p(0, 1, 1) }))), d).not.toBe(key(a));
  });

  it('a scar, a bandage and an eye patch add their pixels on top of the same face', () => {
    const plain = portraitGrid(base());
    const scarred = portraitGrid(base({ scars: [p(0)] }));
    expect(pixelsOf(scarred, 'scars').length).toBeGreaterThan(3);
    expect(key(scarred)).not.toBe(key(plain));
    // only the scar changed: every changed pixel touches the scar
    const scarredScars = new Set(pixelsOf(scarred, 'scars'));
    const changed = scarred.shades.flatMap((v, i) => (v !== plain.shades[i] ? [i] : []));
    const W = PORTRAIT_WIDTH;
    expect(changed.every((i) => [0, -1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1].some((d) => scarredScars.has(i + d)))).toBe(true);

    const patched = portraitGrid(base({ eyepatch: 'left' }));
    expect(colsOf(patched, 'eyes').every((x) => x > W / 2)).toBe(true);
    expect(Math.min(...colsOf(patched, 'eyepatch'))).toBeLessThan(W / 2);
    expect(pixelsOf(portraitGrid(base({ bandages: [p(0)] })), 'bandages').length).toBeGreaterThan(0);
  });

  it('the mood shows on the face; the dead close their eyes', () => {
    const moods = ['neutral', 'joy', 'triumph', 'threat', 'pain', 'loss', 'shame', 'anger', 'dead'];
    const faces = new Set(moods.map((m) => key(portraitGrid(base({ expression: m })))));
    expect(faces.size).toBe(moods.length);
    const dead = portraitGrid(base({ expression: 'dead', dead: true }));
    expect(pixelsOf(dead, 'eyes').length).toBeLessThan(pixelsOf(portraitGrid(base()), 'eyes').length * 0.7);
  });

  it('grey hair turns from ink toward the paper', () => {
    const shades = [0, 1, 2, 3].map((grey) => {
      const g = portraitGrid(base({ hair: p(1), grey }));
      return mean(g, pixelsOf(g, 'hair'));
    });
    expect(shades[0]).toBeLessThan(shades[1]!);
    expect(shades[1]).toBeLessThan(shades[2]!);
    expect(shades[2]).toBeLessThan(shades[3]!);
  });

  it('a child is smaller than a grown man', () => {
    const count = (g: Grid) => pixelsOf(g, 'head').length;
    expect(count(portraitGrid(base({ stage: 'child', age: 8 })))).toBeLessThan(count(portraitGrid(base())));
  });
});

describe('headwear (D-305)', () => {
  it('nine kinds for each sex, each drawn differently, and a hat covers the crown of the head', () => {
    for (const sex of ['male', 'female'] as const) {
      const kinds = new Set<string>();
      const looks = new Set<string>();
      for (let variant = 0; variant < 3; variant++) {
        for (const dx of [-1, 0, 1]) {
          const hat = { slot: 'head' as const, variant, dx, dy: 0 };
          const spec = base({ sex, beard: null, accessories: [hat] });
          const g = portraitGrid(spec);
          kinds.add(headwearKind(anatomyOf(spec), hat));
          looks.add(key(g));
          const hatPixels = pixelsOf(g, 'headwear');
          const headTop = Math.min(...rowsOf(portraitGrid(base({ sex, beard: null, hair: null })), 'head'));
          expect(Math.min(...hatPixels.map((i) => Math.floor(i / PORTRAIT_WIDTH)))).toBeLessThanOrEqual(headTop);
        }
      }
      expect(kinds.size).toBe(9);
      expect(looks.size).toBe(9);
    }
  });
});

describe('portraits of real people (D-301)', () => {
  const content = loadOrThrow(BASE_FILES);

  it('scarred people do not all wear the same scar; one person keeps his face', () => {
    const state = newGame(3, content);
    const ctx = { state, content };
    const scars = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const c = createCharacter(ctx, { surname: 'Test', age: { min: 30, max: 30 } });
      c.traits.push('scarred');
      const g = portraitGrid(faceSpec(ctx, c, 'neutral'));
      scars.add(pixelsOf(g, 'scars').join(','));
    }
    expect(scars.size).toBeGreaterThan(8);
    const hero = getPlayer(state);
    const before = key(portraitGrid(faceSpec(ctx, hero, 'neutral')));
    expect(key(portraitGrid(faceSpec(ctx, hero, 'neutral')))).toBe(before);
  }, 20000);
});

describe('portrait text (D-248)', () => {
  it('names what the picture shows', () => {
    const text = portraitText(base({ scars: [p()], eyepatch: 'right', expression: 'anger', grey: 2, beard: p() }));
    expect(text).toMatch(/^Portrait of a man of 35/);
    for (const word of ['grey hair', 'a beard', 'a scar', 'a patch over one eye', 'angry']) expect(text).toContain(word);
    expect(portraitText(base({ sex: 'female', stage: 'child', age: 7 }))).toContain('a girl of 7');
  });
});
