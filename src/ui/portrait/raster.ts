import { SHADES } from './grid';

/**
 * Drawing in flat shades, as a pixel artist does (4.12, D-305): shapes filled with one shade each, single-pixel lines,
 * a few hand-placed pixels. A pixel is inside a shape when its middle is. No blending and no dithering.
 *
 * Shapes are given in design units: a 64×80 frame. The picture is `SCALE` times larger, so the same drawing gains
 * detail while lines stay one pixel thin.
 */

export type Point = [number, number];

export const SCALE = 1.5;
export const DESIGN_WIDTH = 64;
export const DESIGN_HEIGHT = 80;
export const WIDTH = DESIGN_WIDTH * SCALE;
export const HEIGHT = DESIGN_HEIGHT * SCALE;

/** A test on the pixel being painted: the detail already there and the middle of the pixel in design units. */
export type Where = (owner: string, x: number, y: number) => boolean;

const clampShade = (s: number) => Math.max(0, Math.min(SHADES - 1, Math.round(s)));

export class Raster {
  readonly shades = new Array<number>(WIDTH * HEIGHT).fill(0);
  readonly owner = new Array<string>(WIDTH * HEIGHT).fill('background');

  /** One pixel, by pixel coordinates. */
  setPx(px: number, py: number, shade: number, part: string): void {
    if (px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT) return;
    const i = py * WIDTH + px;
    this.shades[i] = clampShade(shade);
    this.owner[i] = part;
  }

  ownerPx(px: number, py: number): string {
    if (px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT) return 'background';
    return this.owner[py * WIDTH + px]!;
  }

  shadePx(px: number, py: number): number {
    if (px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT) return 0;
    return this.shades[py * WIDTH + px]!;
  }

  /** The pixel under a design point. */
  set(x: number, y: number, shade: number, part: string): void {
    this.setPx(Math.floor(x * SCALE), Math.floor(y * SCALE), shade, part);
  }

  ownerAt(x: number, y: number): string {
    return this.ownerPx(Math.floor(x * SCALE), Math.floor(y * SCALE));
  }

  /** Visits every pixel whose middle lies inside a test, within design bounds. */
  private each(x0: number, y0: number, x1: number, y1: number, test: (x: number, y: number) => boolean, paint: (i: number, px: number, py: number, x: number, y: number) => void): void {
    const py0 = Math.max(0, Math.floor(y0 * SCALE));
    const py1 = Math.min(HEIGHT - 1, Math.ceil(y1 * SCALE));
    const px0 = Math.max(0, Math.floor(x0 * SCALE));
    const px1 = Math.min(WIDTH - 1, Math.ceil(x1 * SCALE));
    for (let py = py0; py <= py1; py++) {
      const y = (py + 0.5) / SCALE;
      for (let px = px0; px <= px1; px++) {
        const x = (px + 0.5) / SCALE;
        if (test(x, y)) paint(py * WIDTH + px, px, py, x, y);
      }
    }
  }

  /** Fills a polygon; `where` can restrict it, for example to pixels of the head. */
  poly(points: Point[], shade: number, part: string, where?: Where): void {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    this.each(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (x, y) => inside(points, x, y), (i, px, py, x, y) => {
      if (!where || where(this.owner[i]!, x, y)) this.setPx(px, py, shade, part);
    });
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, shade: number, part: string, where?: Where): void {
    this.each(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, (i, px, py, x, y) => {
      if (!where || where(this.owner[i]!, x, y)) this.setPx(px, py, shade, part);
    });
  }

  /** Darkens (or lightens) what is already inside a polygon, keeping its owner: a cast shadow. */
  shadow(points: Point[], delta: number, where: (owner: string) => boolean): void {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    this.each(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (x, y) => inside(points, x, y), (i) => {
      if (where(this.owner[i]!)) this.shades[i] = clampShade(this.shades[i]! + delta);
    });
  }

  /**
   * A one-pixel line through design points (Bresenham in pixels). A function shade gets the pixel and its index along
   * the line and may return null to skip it.
   */
  line(x0: number, y0: number, x1: number, y1: number, shade: number | ((px: number, py: number, i: number) => number | null), part: string): void {
    let x = Math.floor(x0 * SCALE);
    let y = Math.floor(y0 * SCALE);
    const xe = Math.floor(x1 * SCALE);
    const ye = Math.floor(y1 * SCALE);
    const dx = Math.abs(xe - x);
    const dy = -Math.abs(ye - y);
    const sx = x < xe ? 1 : -1;
    const sy = y < ye ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; ; i++) {
      const s = typeof shade === 'number' ? shade : shade(x, y, i);
      if (s !== null) this.setPx(x, y, s, part);
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

  /** A polyline through design points. */
  path(points: Point[], shade: number | ((px: number, py: number, i: number) => number | null), part: string): void {
    for (let k = 1; k < points.length; k++) this.line(points[k - 1]![0], points[k - 1]![1], points[k]![0], points[k]![1], shade, part);
  }

  /**
   * Hand-placed pixels: rows of shade digits `0`–`9`, `a` (10), `b` (11); `.` leaves the pixel. Placed at the pixel
   * under a design point, drawn at pixel size.
   */
  sprite(rows: readonly string[], x: number, y: number, part: string, mirror = false): void {
    const px = Math.floor(x * SCALE);
    const py = Math.floor(y * SCALE);
    rows.forEach((row, dy) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[mirror ? row.length - 1 - i : i]!;
        if (ch !== '.' && ch !== ' ') this.setPx(px + i, py + dy, parseInt(ch, 12), part);
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

/** A smooth curve through points (Catmull–Rom), as a polyline with `steps` points per span: no corners in an outline. */
export function smoothPath(points: Point[], steps = 4, closed = false): Point[] {
  const n = points.length;
  const at = (i: number) => points[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))]!;
  const out: Point[] = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, d: number, e: number) => 0.5 * (2 * b + (-a + d) * t + (2 * a - 5 * b + 4 * d - e) * t2 + (-a + 3 * b - 3 * d + e) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(points[n - 1]!);
  return out;
}

/** A curve moved sideways: each point shifted by `d` along x (a band beside an outline). */
export function shifted(points: Point[], dx: number, dy = 0): Point[] {
  return points.map(([x, y]) => [x + dx, y + dy]);
}
