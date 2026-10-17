/**
 * A pixel grid of two paints (D-300): 0 is empty (the page shows through), 1 is the light paint, 2 is the ink.
 * Every detail paints under its own name, so a test can find where a detail landed.
 */

export const EMPTY = 0;
export const LIGHT = 1;
export const INK = 2;
export type Paint = typeof EMPTY | typeof LIGHT | typeof INK;

export interface Grid {
  width: number;
  height: number;
  /** Row by row, `width * height` paints. */
  pixels: Paint[];
  /** Row by row, the detail that painted each pixel last; null where nothing did. */
  owner: (string | null)[];
}

export function newGrid(width: number, height: number): Grid {
  return { width, height, pixels: new Array<Paint>(width * height).fill(EMPTY), owner: new Array<string | null>(width * height).fill(null) };
}

/** Indexes of the pixels a detail shows on the finished picture (not those a later detail painted over). */
export function pixelsOf(g: Grid, part: string): number[] {
  return g.owner.flatMap((o, i) => (o === part ? [i] : []));
}

export function get(g: Grid, x: number, y: number): Paint {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return EMPTY;
  return g.pixels[y * g.width + x] ?? EMPTY;
}

export function set(g: Grid, part: string, x: number, y: number, paint: Paint): void {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return;
  const i = y * g.width + x;
  g.pixels[i] = paint;
  g.owner[i] = part;
}

/**
 * A sprite: rows of `#` ink, `o` light paint, `.` or space untouched. `mirror` flips it left to right, so one sprite
 * serves both eyes, brows and ears.
 */
export function stamp(g: Grid, part: string, sprite: readonly string[], x: number, y: number, mirror = false): void {
  sprite.forEach((row, dy) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[mirror ? row.length - 1 - i : i];
      if (ch === '#') set(g, part, x + i, y + dy, INK);
      else if (ch === 'o') set(g, part, x + i, y + dy, LIGHT);
    }
  });
}

/** Integer line from one point to another (Bresenham), every pixel painted by `paint(x, y)`. */
export function line(x0: number, y0: number, x1: number, y1: number, paint: (x: number, y: number) => void): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    paint(x, y);
    if (x === x1 && y === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/** Paints a region given as a test: light inside, ink on its edge (a pixel inside with a side neighbour outside). */
export function fillOutlined(g: Grid, part: string, inside: (x: number, y: number) => boolean, fill: Paint = LIGHT): void {
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      set(g, part, x, y, edge ? INK : fill);
    }
  }
}
