/**
 * A pixel grid in shades of two colours (D-300, D-304): shade 0 is the ink, the last shade is the paper, the shades
 * between are mixes of the two. No dithering: every pixel has one shade, smooth transitions come from shading.
 * Every pixel remembers which detail painted it, so a test can find where a detail landed.
 */

export const SHADES = 12;

export interface Grid {
  width: number;
  height: number;
  /** Row by row, `width * height` shades `0..SHADES-1`. */
  shades: number[];
  /** Row by row, the detail seen at each pixel (the last that covered its middle). */
  owner: string[];
}

/** Indexes of the pixels a detail shows on the finished picture. */
export function pixelsOf(g: Grid, part: string): number[] {
  return g.owner.flatMap((o, i) => (o === part ? [i] : []));
}

/** Tone 0..1 (ink..paper) to a shade. */
export function shadeOf(tone: number): number {
  return Math.round(Math.min(1, Math.max(0, tone)) * (SHADES - 1));
}
