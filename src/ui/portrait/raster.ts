import { SHADES } from './grid';

/**
 * Drawing in flat shades, as a pixel artist does (4.12, D-305): polygons filled with one shade each, small hand-drawn
 * sprites, single-pixel lines. A pixel is inside a shape when its middle is. No blending and no dithering.
 */

export type Point = [number, number];

export const WIDTH = 64;
export const HEIGHT = 80;

export class Raster {
  readonly shades = new Array<number>(WIDTH * HEIGHT).fill(0);
  readonly owner = new Array<string>(WIDTH * HEIGHT).fill('background');

  set(x: number, y: number, shade: number, part: string): void {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= WIDTH || yi >= HEIGHT) return;
    const i = yi * WIDTH + xi;
    this.shades[i] = Math.max(0, Math.min(SHADES - 1, Math.round(shade)));
    this.owner[i] = part;
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return 0;
    return this.shades[y * WIDTH + x]!;
  }

  ownerAt(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return 'background';
    return this.owner[y * WIDTH + x]!;
  }

  /** Fills every pixel whose middle lies inside the polygon; `where` can restrict it (by the detail already there). */
  poly(points: Point[], shade: number, part: string, where?: (owner: string, x: number, y: number) => boolean): void {
    const ys = points.map((p) => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(HEIGHT - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < WIDTH; x++) {
        if (inside(points, x + 0.5, y + 0.5) && (!where || where(this.owner[y * WIDTH + x]!, x, y))) this.set(x, y, shade, part);
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, shade: number, part: string, where?: (owner: string, x: number, y: number) => boolean): void {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(HEIGHT - 1, Math.ceil(cy + ry)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(WIDTH - 1, Math.ceil(cx + rx)); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!where || where(this.owner[y * WIDTH + x]!, x, y))) this.set(x, y, shade, part);
      }
    }
  }

  /** Darkens (or lightens) what is already drawn inside a polygon, keeping its owner: a cast shadow. */
  shadow(points: Point[], delta: number, where: (owner: string) => boolean): void {
    const ys = points.map((p) => p[1]);
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(HEIGHT - 1, Math.ceil(Math.max(...ys))); y++) {
      for (let x = 0; x < WIDTH; x++) {
        const i = y * WIDTH + x;
        if (inside(points, x + 0.5, y + 0.5) && where(this.owner[i]!)) this.shades[i] = Math.max(0, Math.min(SHADES - 1, this.shades[i]! + delta));
      }
    }
  }

  /** A one-pixel line (Bresenham) between two points. */
  line(x0: number, y0: number, x1: number, y1: number, shade: number | ((x: number, y: number, i: number) => number | null), part: string): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const xe = Math.round(x1);
    const ye = Math.round(y1);
    const dx = Math.abs(xe - x);
    const dy = -Math.abs(ye - y);
    const sx = x < xe ? 1 : -1;
    const sy = y < ye ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; ; i++) {
      const s = typeof shade === 'number' ? shade : shade(x, y, i);
      if (s !== null) this.set(x, y, s, part);
      if (x === xe && y === ye) return;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /**
   * A hand-drawn sprite: rows of shade digits `0`–`9`, `a` (10), `b` (11); `.` or a space leaves the pixel. With
   * `mirror` the rows are read right to left (the same part on the other side of the face).
   */
  sprite(rows: readonly string[], x: number, y: number, part: string, mirror = false): void {
    rows.forEach((row, dy) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[mirror ? row.length - 1 - i : i]!;
        if (ch === '.' || ch === ' ') continue;
        this.set(x + i, y + dy, parseInt(ch, 12), part);
      }
    });
  }
}

export function inside(points: Point[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** The same shape on the other side of a vertical axis. */
export function mirror(points: Point[], axis: number): Point[] {
  return points.map(([x, y]) => [2 * axis - x, y]);
}

/** Points turned by an angle (radians) round a centre: a hat worn askew. */
export function turn(points: Point[], ox: number, oy: number, angle: number): Point[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return points.map(([x, y]) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]);
}
