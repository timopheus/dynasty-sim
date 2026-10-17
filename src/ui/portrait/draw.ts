import type { FaceSpec } from '../../core/looks';
import { anatomy } from './anatomy';
import { bandages, body, eyepatch, headwear, jewel, scars } from './dress';
import type { Grid } from './grid';
import { backHair, beard, frontHair, hairLocks, hairTones, moustache } from './hair';
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

/** Details whose single pixels are deliberate (a spark in the eye, a nostril, a pearl). */
const DELIBERATE = new Set(['eyes', 'nose', 'mouth', 'jewel', 'mole', 'scars']);

/**
 * The clean-up pass a pixel artist makes: a lone pixel whose four neighbours agree on another shade of the same
 * surface takes their shade, and so does its owner.
 */
export function cleanUp(r: Raster): void {
  for (let py = 1; py < HEIGHT - 1; py++) {
    for (let px = 1; px < WIDTH - 1; px++) {
      const i = py * WIDTH + px;
      if (DELIBERATE.has(r.owner[i]!)) continue;
      const near = [i - 1, i + 1, i - WIDTH, i + WIDTH];
      const s0 = r.shades[near[0]!]!;
      const o0 = r.owner[near[0]!]!;
      if (near.every((j) => r.shades[j] === s0 && r.owner[j] === o0) && (r.shades[i] !== s0 || r.owner[i] !== o0)) {
        r.shades[i] = s0;
        r.owner[i] = o0;
      }
    }
  }
}

const SKIN_PARTS = new Set(['head', 'wrinkles', 'nose']);
const AROUND_SKIN = new Set(['hair', 'headwear', 'neck', 'attire', 'beard', 'bandages']);

/**
 * Inner contour: where the face meets hair, a hat, the neck or clothes, its edge darkens, so the face never melts into
 * hair of the same tone and the jaw stands off the neck.
 */
function innerContour(r: Raster): void {
  const darker: number[] = [];
  for (let py = 1; py < HEIGHT - 1; py++) {
    for (let px = 1; px < WIDTH - 1; px++) {
      const i = py * WIDTH + px;
      if (!SKIN_PARTS.has(r.owner[i]!)) continue;
      if ([i - 1, i + 1, i - WIDTH, i + WIDTH].some((j) => AROUND_SKIN.has(r.owner[j]!))) darker.push(i);
    }
  }
  for (const i of darker) r.shades[i] = Math.max(1, Math.min(r.shades[i]! - 3, 5));
}

export function portraitGrid(spec: FaceSpec): Grid {
  const a = anatomy(spec);
  const r = new Raster();
  // a plain field, a step darker behind the shoulders
  for (let py = 0; py < HEIGHT; py++) for (let px = 0; px < WIDTH; px++) r.setPx(px, py, py >= (a.shoulders + 2) * (HEIGHT / 80) ? 6 : 7, 'background');
  backHair(r, a);
  body(r, a);
  neck(r, a);
  hairLocks(r, a);
  ears(r, a);
  skull(r, a);
  nose(r, a);
  pallor(r, a);
  wrinkles(r, a);
  eyes(r, a);
  brows(r, a, Math.min(9, hairTones(a).main + 1), hairTones(a).main);
  mole(r, a);
  frontHair(r, a);
  beard(r, a);
  mouth(r, a);
  moustache(r, a);
  scars(r, a);
  bandages(r, a);
  eyepatch(r, a);
  headwear(r, a);
  jewel(r, a);
  cleanUp(r);
  innerContour(r);
  // the contour: dark on the shaded side, a softer line on the lit side
  const shades = r.shades.slice();
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = y * WIDTH + x;
      if (!FIGURE.has(r.owner[i]!)) continue;
      const edge = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => r.ownerPx(x + dx!, y + dy!) === 'background');
      if (edge) shades[i] = x < (a.cx * WIDTH) / 64 ? Math.min(shades[i]!, 3) : Math.min(shades[i]!, 1);
    }
  }
  return { width: WIDTH, height: HEIGHT, shades, owner: r.owner.slice() };
}
