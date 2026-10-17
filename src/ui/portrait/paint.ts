import { SHADES, type Grid } from './grid';

/** The two colours (D-300, D-304): brown-black ink and warm paper. Every shade is a mix of the two. */
export const INK = [0x1c, 0x13, 0x0e] as const;
export const PAPER = [0xf4, 0xe7, 0xc8] as const;

/** Shade → [r, g, b]: an even mix from the ink (0) to the paper (`SHADES-1`). */
export function shadeColor(shade: number): [number, number, number] {
  const t = shade / (SHADES - 1);
  return [0, 1, 2].map((i) => Math.round(INK[i]! + (PAPER[i]! - INK[i]!) * t)) as [number, number, number];
}

/** Pixels as RGBA bytes, row by row: what a canvas `ImageData` takes. */
export function gridRgba(g: Grid): Uint8ClampedArray {
  const out = new Uint8ClampedArray(g.width * g.height * 4);
  const palette = Array.from({ length: SHADES }, (_, s) => shadeColor(s));
  g.shades.forEach((s, i) => {
    const [r, gr, b] = palette[s]!;
    out.set([r, gr, b, 255], i * 4);
  });
  return out;
}
