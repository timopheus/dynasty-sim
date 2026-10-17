/** Small shape and shading helpers of the portrait (4.12). All in pixel units of the 64×80 grid. */

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function smooth(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** A soft bump: 1 at the middle, falling off as a bell curve with the given radii. */
export function gauss(x: number, y: number, bx: number, by: number, rx: number, ry: number): number {
  const a = (x - bx) / rx;
  const b = (y - by) / ry;
  return Math.exp(-(a * a + b * b));
}

/** 1 in the middle of an ellipse, fading to 0 at its edge. */
export function blob(x: number, y: number, bx: number, by: number, rx: number, ry: number): number {
  return 1 - smooth(0, 1, Math.hypot((x - bx) / rx, (y - by) / ry));
}

export function inEllipse(x: number, y: number, bx: number, by: number, rx: number, ry: number): boolean {
  return ((x - bx) / rx) ** 2 + ((y - by) / ry) ** 2 <= 1;
}

/** Distance from a point to a segment, and where along it (0..1) the nearest point lies. */
export function segDist(x: number, y: number, x0: number, y0: number, x1: number, y1: number): { d: number; t: number } {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const t = clamp(((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy));
  return { d: Math.hypot(x - x0 - vx * t, y - y0 - vy * t), t };
}

/** Light from the upper left and the front. */
export const LIGHT_DIR = (() => {
  const v = [-0.32, -0.5, 0.8];
  const n = Math.hypot(v[0]!, v[1]!, v[2]!);
  return v.map((c) => c / n) as [number, number, number];
})();

/** Diffuse light on a rounded surface given the x and y of its normal (-1..1). */
export function lambert(nx: number, ny: number): number {
  const nz = Math.sqrt(Math.max(0.04, 1 - nx * nx - ny * ny));
  const n = Math.hypot(nx, ny, nz);
  return clamp((nx * LIGHT_DIR[0] + ny * LIGHT_DIR[1] + nz * LIGHT_DIR[2]) / n);
}

/** Point (x, y) turned by `angle` radians round (ox, oy). */
export function rotate(x: number, y: number, ox: number, oy: number, angle: number): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [ox + (x - ox) * c + (y - oy) * s, oy - (x - ox) * s + (y - oy) * c];
}

/** The layers of one sample, painted back to front: a tone 0 (ink) .. 1 (paper) and the detail seen. */
export class Sample {
  tone = 0;
  owner = 'background';
  put(cover: number, tone: number, owner: string): void {
    if (cover <= 0) return;
    this.tone += (tone - this.tone) * Math.min(1, cover);
    if (cover >= 0.5) this.owner = owner;
  }
}
