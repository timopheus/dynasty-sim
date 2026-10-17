import type { FaceSpec } from '../../core/looks';
import { bandages, body, eyepatch, headwear, jewel, scars } from './dress';
import { brows, ears, eyes, faceHeight, mole, mouth, neck, skin, wrinkles } from './face';
import { geometry, headHalf, type Geometry } from './geometry';
import { SHADES, shadeOf, type Grid } from './grid';
import { backHair, beard, frontHair, hairBase, tiedHair } from './hair';
import { clamp, smooth, Sample } from './shape';

/**
 * The portrait as a grid of shades (4.12, D-304, D-305), drawn only from `FaceSpec`. Every pixel is the average of
 * 3×3 samples; a sample is the tone (0 ink .. 1 paper) of the layers that cover it. The face is a relief lit from the
 * upper left. The averaged tone is cut to one of `SHADES` shades, without dithering. Pure: the same spec gives the
 * same pixels.
 */

export const PORTRAIT_WIDTH = 64;
export const PORTRAIT_HEIGHT = 80;

const SUB = 3;
/**
 * The camera: the parts are laid out in a 64×80 frame of their own, and the picture shows its middle, enlarged, so a
 * head and shoulders fill it.
 */
const ZOOM = 1.34;
const FOCUS_X = 32;
const FOCUS_Y = 35;
const FOCUS_PX = 37;
const designX = (px: number) => FOCUS_X + (px - PORTRAIT_WIDTH / 2) / ZOOM;
const designY = (py: number) => FOCUS_Y + (py - FOCUS_PX) / ZOOM;

function background(c: Sample, y: number): void {
  // a plain field, a shade darker toward the bottom
  c.put(1, 0.8 - 0.07 * smooth(35, 62, y), 'background');
}

function sample(g: Geometry, x: number, y: number, height: (dx: number, dy: number) => number, step: number): Sample {
  const c = new Sample();
  background(c, y);
  body(g, c, x, y);
  backHair(g, c, x, y);
  tiedHair(g, c, x, y);
  neck(g, c, x, y);
  ears(g, c, x, y);
  if (Math.abs(x - g.cx) <= headHalf(g, y)) {
    skin(g, c, height(0, 0), height(-1, 0), height(1, 0), height(0, -1), height(0, 1), step);
    wrinkles(g, c, x, y);
    mouth(g, c, x, y);
    eyes(g, c, x, y);
    mole(g, c, x, y);
    brows(g, c, x, y, hairBase(g) + 0.06);
  }
  frontHair(g, c, x, y);
  beard(g, c, x, y);
  scars(g, c, x, y);
  bandages(g, c, x, y);
  eyepatch(g, c, x, y);
  headwear(g, c, x, y);
  jewel(g, c, x, y);
  return c;
}

/** Details that make the outline of the figure: a rim of shade where they meet the background. */
const FIGURE = new Set(['head', 'hair', 'attire', 'neck', 'ears', 'headwear', 'beard', 'bandages']);

export function portraitGrid(spec: FaceSpec): Grid {
  const g = geometry(spec);
  const width = PORTRAIT_WIDTH;
  const height = PORTRAIT_HEIGHT;
  const sw = width * SUB;
  const sh = height * SUB;
  // the relief of the face, once per sample, with a border of one sample for the normals
  const relief = new Float64Array((sw + 2) * (sh + 2));
  for (let j = 0; j < sh + 2; j++) {
    const y = designY((j - 1 + 0.5) / SUB);
    const half = headHalf(g, y);
    if (half <= 0) continue;
    for (let i = 0; i < sw + 2; i++) {
      const x = designX((i - 1 + 0.5) / SUB);
      if (Math.abs(x - g.cx) <= half + 1) relief[j * (sw + 2) + i] = faceHeight(g, x, y);
    }
  }
  const tones = new Float64Array(width * height);
  const owner: string[] = new Array<string>(width * height).fill('background');
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) {
      const at = (dx: number, dy: number) => relief[(j + 1 + dy) * (sw + 2) + (i + 1 + dx)]!;
      const c = sample(g, designX((i + 0.5) / SUB), designY((j + 0.5) / SUB), at, 1 / SUB / ZOOM);
      const p = Math.floor(j / SUB) * width + Math.floor(i / SUB);
      tones[p] = tones[p]! + c.tone / (SUB * SUB);
      if (i % SUB === 1 && j % SUB === 1) owner[p] = c.owner;
    }
  }
  const isBackground = (k: number) => owner[k] === 'background';
  const shades = Array.from(tones, (tone, k) => {
    const x = k % width;
    let t = clamp((tone - 0.5) * 1.12 + 0.52);
    if (FIGURE.has(owner[k]!)) {
      const rim = (x > 0 && isBackground(k - 1)) || (x < width - 1 && isBackground(k + 1)) || (k >= width && isBackground(k - width)) || (k + width < tones.length && isBackground(k + width));
      if (rim) t -= 0.14;
    }
    return Math.min(SHADES - 1, shadeOf(t));
  });
  return { width, height, shades, owner };
}
