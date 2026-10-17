import type { FaceSpec } from '../../core/looks';
import { anatomy } from './anatomy';
import { bandages, body, eyepatch, headwear, jewel, scars } from './dress';
import type { Grid } from './grid';
import { backHair, beard, frontHair, hairTones } from './hair';
import { brows, ears, eyes, mole, mouth, neck, nose, pallor, skull, wrinkles } from './head';
import { HEIGHT, Raster, WIDTH } from './raster';

/**
 * The portrait (4.12, D-304, D-305): a head and shoulders drawn in flat planes of shade, as a pixel artist draws
 * them, from `FaceSpec` alone. Pure: the same spec gives the same pixels.
 */

export const PORTRAIT_WIDTH = WIDTH;
export const PORTRAIT_HEIGHT = HEIGHT;

/** Details that make the figure: a contour where they meet the background. */
const FIGURE = new Set(['head', 'hair', 'attire', 'neck', 'ears', 'headwear', 'beard', 'bandages', 'jewel']);

export function portraitGrid(spec: FaceSpec): Grid {
  const a = anatomy(spec);
  const r = new Raster();
  // a plain field, a step darker behind the shoulders
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) r.set(x, y, y >= a.shoulders + 2 ? 6 : 7, 'background');
  body(r, a);
  backHair(r, a);
  neck(r, a);
  ears(r, a);
  skull(r, a);
  nose(r, a);
  pallor(r, a);
  wrinkles(r, a);
  eyes(r, a);
  brows(r, a, Math.min(9, hairTones(a).main + 1));
  mole(r, a);
  frontHair(r, a);
  beard(r, a);
  mouth(r, a);
  scars(r, a);
  bandages(r, a);
  eyepatch(r, a);
  headwear(r, a);
  jewel(r, a);
  // the contour: dark on the shaded side, a softer line on the lit side
  const shades = r.shades.slice();
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = y * WIDTH + x;
      if (!FIGURE.has(r.owner[i]!)) continue;
      const edge = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => r.ownerAt(x + dx!, y + dy!) === 'background');
      if (edge) shades[i] = x < a.cx ? Math.min(shades[i]!, 3) : Math.min(shades[i]!, 1);
    }
  }
  return { width: WIDTH, height: HEIGHT, shades, owner: r.owner.slice() };
}
