import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/hooks';
import { faceSpec, VARIANTS, type FaceSpec, type Part } from '../src/core/looks';
import { EMPTY, INK, LIGHT, PAINTS, PORTRAIT_HEIGHT, PORTRAIT_WIDTH, gridSvg, pixelsOf, portraitGrid, portraitSvg, portraitText, type Grid } from '../src/ui/portrait';
import { BASE_FILES, loadOrThrow } from './fixtures/content';

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
const key = (g: Grid) => g.pixels.join('');

describe('portrait grid (4.12, D-300)', () => {
  it('is a pure function of the spec: the same spec gives the same pixels', () => {
    expect(portraitGrid(base())).toEqual(portraitGrid(base()));
  });

  it('uses two paints and the empty background only', () => {
    const g = portraitGrid(base({ attire: 3, accessories: [{ slot: 'head', ...p() }, { slot: 'ear', ...p() }], beard: p(), wrinkles: { ...p(), level: 3 } }));
    expect(g.pixels).toHaveLength(PORTRAIT_WIDTH * PORTRAIT_HEIGHT);
    expect(new Set(g.pixels)).toEqual(new Set([EMPTY, LIGHT, INK]));
    const svg = portraitSvg(base(), 'x');
    const fills = [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
    expect(fills).toEqual([PAINTS.light, PAINTS.ink]);
  });

  it('puts every detail in its place: hair above the brows, brows above the eyes, then nose, mouth, clothes', () => {
    const g = portraitGrid(base());
    const top = (part: string) => Math.min(...rowsOf(g, part));
    const bottom = (part: string) => Math.max(...rowsOf(g, part));
    for (const part of ['hair', 'brows', 'eyes', 'nose', 'mouth', 'attire', 'head', 'ears']) expect(pixelsOf(g, part).length, part).toBeGreaterThan(0);
    expect(top('hair')).toBeLessThan(top('brows'));
    expect(bottom('brows')).toBeLessThan(top('eyes'));
    expect(bottom('eyes')).toBeLessThan(bottom('nose'));
    expect(bottom('nose')).toBeLessThan(top('mouth'));
    expect(bottom('mouth')).toBeLessThan(top('attire'));
    // eyes on both sides of the middle column, mirrored
    const eyes = colsOf(g, 'eyes');
    expect(eyes.some((x) => x < 16) && eyes.some((x) => x > 16)).toBe(true);
    expect(eyes.filter((x) => x < 16).map((x) => 32 - x).sort()).toEqual(eyes.filter((x) => x > 16).sort());
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
    const a = portraitGrid(base());
    const b = portraitGrid(base({ nose: p(0, 1, 0) }));
    expect(colsOf(b, 'nose').map((x) => x - 1).sort()).toEqual(colsOf(a, 'nose').sort());
  });

  it('a scar, a bandage and an eye patch add their pixels on top of the same face', () => {
    const plain = portraitGrid(base());
    const scarred = portraitGrid(base({ scars: [p(0)] }));
    expect(pixelsOf(scarred, 'scars').length).toBeGreaterThan(3);
    expect(key(scarred)).not.toBe(key(plain));
    // only the scar changed: every other pixel stays as it was
    const scarredScars = new Set(pixelsOf(scarred, 'scars'));
    const changed = scarred.pixels.flatMap((v, i) => (v !== plain.pixels[i] ? [i] : []));
    expect(changed.every((i) => scarredScars.has(i))).toBe(true);

    const patched = portraitGrid(base({ eyepatch: 'left' }));
    expect(colsOf(patched, 'eyes').every((x) => x > 16)).toBe(true);
    expect(Math.min(...colsOf(patched, 'eyepatch'))).toBeLessThan(16);
    expect(pixelsOf(portraitGrid(base({ bandages: [p(0)] })), 'bandages').length).toBeGreaterThan(0);
  });

  it('the mood shows on the face; the dead close their eyes', () => {
    const moods = ['neutral', 'joy', 'triumph', 'threat', 'pain', 'loss', 'shame', 'anger', 'dead'];
    const faces = new Set(moods.map((m) => key(portraitGrid(base({ expression: m })))));
    expect(faces.size).toBe(moods.length);
    const dead = portraitGrid(base({ expression: 'dead', dead: true }));
    expect(rowsOf(dead, 'eyes')).toHaveLength(1);
  });

  it('grey hair turns from ink to the light paint', () => {
    const light = (g: Grid) => pixelsOf(g, 'hair').filter((i) => g.pixels[i] === LIGHT).length;
    const shades = [0, 1, 2, 3].map((grey) => light(portraitGrid(base({ hair: p(1), grey }))));
    expect(shades[0]).toBe(0);
    expect(shades[1]).toBeLessThan(shades[2]!);
    expect(shades[2]).toBeLessThan(shades[3]!);
  });

  it('a child is smaller than a grown man', () => {
    const count = (g: Grid) => pixelsOf(g, 'head').length;
    expect(count(portraitGrid(base({ stage: 'child', age: 8 })))).toBeLessThan(count(portraitGrid(base())));
  });
});

describe('portraits of real people (D-301)', () => {
  const content = loadOrThrow(BASE_FILES);

  it('a hundred scarred people do not all wear the same scar; one person keeps his face', () => {
    const state = newGame(3, content);
    const ctx = { state, content };
    const scars = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const c = createCharacter(ctx, { surname: 'Test', age: { min: 30, max: 30 } });
      c.traits.push('scarred');
      const g = portraitGrid(faceSpec(ctx, c, 'neutral'));
      scars.add(pixelsOf(g, 'scars').join(','));
    }
    expect(scars.size).toBeGreaterThan(10);
    const hero = getPlayer(state);
    const before = key(portraitGrid(faceSpec(ctx, hero, 'neutral')));
    expect(key(portraitGrid(faceSpec(ctx, hero, 'neutral')))).toBe(before);
  });
});

describe('portrait text (D-248)', () => {
  it('names what the picture shows', () => {
    const text = portraitText(base({ scars: [p()], eyepatch: 'right', expression: 'anger', grey: 2, beard: p() }));
    expect(text).toMatch(/^Portrait of a man of 35/);
    for (const word of ['grey hair', 'a beard', 'a scar', 'a patch over one eye', 'angry']) expect(text).toContain(word);
    expect(portraitText(base({ sex: 'female', stage: 'child', age: 7 }))).toContain('a girl of 7');
  });

  it('is escaped inside the markup', () => {
    const svg = gridSvg(portraitGrid(base()), '<b>"x" & y</b>');
    expect(svg).toContain('aria-label="&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;"');
    expect(svg).not.toContain('<b>');
  });
});
