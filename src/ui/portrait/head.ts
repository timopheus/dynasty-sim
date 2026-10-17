import type { Anatomy } from './anatomy';
import { mirror, smoothPath, type Point, type Raster } from './raster';

/**
 * The head in planes of shade (4.12, D-305). Light falls from the upper left. The edge between light and shadow
 * follows the form — round the forehead, over the cheekbone, down the jaw — and never runs straight down the middle.
 * The features are built from each person's measures, not stamped from one picture.
 */

const SKIN = new Set(['head', 'wrinkles']);
const onSkin = (o: string) => SKIN.has(o);

/** The right half of the head's outline, crown to chin. */
function rightOutline(a: Anatomy): Point[] {
  const { cx, top, hw, cheek, jaw, chinW, chin, browY, cheekY, mouthY } = a;
  return [
    [cx, top],
    [cx + hw * 0.45, top + 0.6],
    [cx + hw * 0.78, top + 3.5],
    [cx + hw * 0.95, top + 8],
    [cx + hw, browY - 6],
    [cx + hw * 0.97, browY],
    [cx + cheek, cheekY],
    [cx + (cheek + jaw) / 2 + 0.4, mouthY - 2.5],
    [cx + jaw, mouthY + 2],
    [cx + (jaw + chinW) / 2, a.chin - 2.8],
    [cx + chinW, chin - 0.7],
    [cx, chin],
  ];
}

export function headShape(a: Anatomy): Point[] {
  const right = rightOutline(a);
  return smoothPath([...mirror(right, a.cx).reverse().slice(0, -1), ...right.slice(0, -1)], 5, true);
}

/** Pixels' current shade, darkened by `delta`: for creases drawn into whatever skin is there. */
function crease(r: Raster, delta: number) {
  return (px: number, py: number): number | null => (onSkin(r.ownerPx(px, py)) ? r.shadePx(px, py) + delta : null);
}

export function ears(r: Raster, a: Anatomy): void {
  const v = a.spec.ears.variant;
  const h = ([5.8, 7, 6.2][v] ?? 6) * (a.child ? 0.9 : 1);
  const out = ([1.7, 1.9, 2.6][v] ?? 1.8) * (a.spec.ears.dx < 0 ? 0.85 : 1);
  for (const side of [-1, 1]) {
    const x = a.cx + side * (a.hw * 0.96);
    const y = a.earY;
    const ear = smoothPath([[x, y - h / 2], [x + side * out * 0.8, y - h / 2 - 0.4], [x + side * out, y - h * 0.15], [x + side * out * 0.8, y + h * 0.3], [x + side * out * 0.2, y + h / 2], [x - side * 0.6, y + h * 0.35]], 4, true);
    const lit = side < 0;
    r.poly(ear, lit ? 8 : 5, 'ears');
    r.poly(smoothPath([[x + side * 0.3, y - h * 0.3], [x + side * out * 0.6, y - h * 0.3], [x + side * out * 0.5, y + h * 0.15], [x + side * 0.3, y + h * 0.1]], 3, true), lit ? 5 : 3, 'ears');
    r.path(smoothPath([[x + side * out * 0.4, y - h / 2], [x + side * out * 0.95, y - h * 0.15], [x + side * out * 0.7, y + h * 0.3]], 3), lit ? 9 : 6, 'ears');
  }
}

export function neck(r: Raster, a: Anatomy): void {
  const { cx, chin, neckHalf: n, shoulders } = a;
  const t = chin - 6;
  const shape: Point[] = [[cx - n, t], [cx + n, t], [cx + n * 1.05, shoulders - 1], [cx + n * 1.5, shoulders + 1.5], [cx - n * 1.5, shoulders + 1.5], [cx - n * 1.05, shoulders - 1]];
  r.poly(shape, 7, 'neck');
  // a lit cylinder: the left catches the light, the right turns into shadow
  r.poly([[cx - n - 1, t], [cx - n * 0.2, t], [cx - n * 0.1, shoulders + 1.5], [cx - n * 1.6, shoulders + 1.5]], 8, 'neck', (o) => o === 'neck');
  r.poly([[cx + n * 0.4, t], [cx + n + 1, t], [cx + n * 1.6, shoulders + 1.5], [cx + n * 0.5, shoulders + 1.5]], 4, 'neck', (o) => o === 'neck');
  // the jaw throws its shadow on the neck, following the jaw's own curve
  const jawLine = rightOutline(a).filter(([, y]) => y >= a.mouthY);
  const curve = smoothPath([...mirror(jawLine, cx).reverse().slice(0, -1), ...jawLine], 3);
  r.poly([...curve, ...curve.map(([x, y]): Point => [x, y + 3.2]).reverse()], 4, 'neck', (o) => o === 'neck');
  r.poly([...curve.filter(([x]) => x > cx), ...curve.filter(([x]) => x > cx).map(([x, y]): Point => [x, y + 3.2]).reverse()], 3, 'neck', (o) => o === 'neck');
  if (!a.female && !a.child) {
    r.ellipse(cx - 0.6, chin + 3.6, 1, 1.3, 8, 'neck', (o) => o === 'neck');
    if (a.old || a.gaunt) for (const side of [-1, 1]) r.line(cx + side * n * 0.8, chin + 1, cx + side * 1.6, shoulders, crease(r, -1), 'neck');
  }
}

export function skull(r: Raster, a: Anatomy): void {
  const { cx, top, hw, cheek, jaw, chinW, chin, browY, eyeY, cheekY, noseBottom: nb, mouthY } = a;
  const soft = a.female || a.child;
  const shape = headShape(a);
  r.poly(shape, 8, 'head');
  // the front facing the light, bounded on the left by the rim of the head turning away
  const rim: Point[] = [[cx - hw * 0.5, top + 1.5], [cx - hw * 0.85, top + 7], [cx - hw + 1.7, browY - 3], [cx - hw + 1.5, browY + 1], [cx - cheek + 1.8, cheekY + 0.5], [cx - jaw + 1.6, mouthY + 1.5], [cx - chinW - 0.4, chin - 1.4]];
  const front: Point[] = [[cx + hw * 0.22, top + 1], [cx + hw * 0.3, browY - 3], [cx + 2, browY + 1.5], [cx + hw * 0.22, cheekY + 1], [cx + hw * 0.12, mouthY], [cx + chinW * 0.3, chin - 1.2]];
  r.poly([...smoothPath(rim, 4), ...smoothPath(front, 4).reverse()], 9, 'head', onSkin);
  // the shadow side: its edge (the terminator) runs round the forehead, over the cheekbone and down the jaw
  const terminator: Point[] = [[cx + hw * 0.4, top - 1], [cx + hw * 0.52, top + 5], [cx + hw * 0.57, browY - 4], [cx + hw * 0.62, browY], [cx + hw * 0.56, cheekY - 1], [cx + hw * 0.46, cheekY + 3], [cx + hw * 0.4, mouthY - 1], [cx + jaw * 0.46, mouthY + 3], [cx + chinW * 0.7, chin - 1.4], [cx + chinW * 0.5, chin + 1]];
  const t = smoothPath(terminator, 4);
  r.poly([...t.map(([x, y]): Point => [x - 1.5, y]), ...t.slice().reverse()], soft ? 7 : 6, 'head', onSkin);
  r.poly([...t, [cx + hw + 4, chin + 1], [cx + hw + 4, top - 1]], soft ? 5 : 4, 'head', onSkin);
  // highlights: the forehead, the crest of the lit cheekbone, the chin
  r.ellipse(cx - hw * 0.2, (top + browY) / 2 + 1, hw * 0.3, (browY - top) * 0.17, 10, 'head', onSkin);
  r.poly(smoothPath([[cx - hw * 0.74, cheekY - 0.2], [cx - hw * 0.42, cheekY - 1.1], [cx - hw * 0.3, cheekY - 0.2], [cx - hw * 0.6, cheekY + 1.1]], 3, true), 10, 'head', onSkin);
  r.ellipse(cx - 0.8, chin - 2.4, chinW * 0.5, 1.2, 10, 'head', onSkin);
  for (const side of [-1, 1]) {
    const lit = side < 0;
    const ex = cx + side * a.eyeOff;
    const ew = a.eye.w;
    // the socket under the brow, deepest beside the nose
    const socket = smoothPath([[ex + side * (ew + 1.4), browY + 0.6], [ex + side * ew * 0.3, browY + 0.4], [cx + side * 1.3, browY + 1.6], [cx + side * 1.5, eyeY + 0.4], [ex - side * ew * 0.6, eyeY - a.eye.h - 0.5], [ex + side * ew * 0.6, eyeY - a.eye.h - 0.3], [ex + side * (ew + 0.9), eyeY - 0.2]], 3, true);
    r.poly(socket, lit ? 7 : 4, 'head', onSkin);
    r.poly([[cx + side * 1.2, browY + 1.8], [cx + side * 2.8, eyeY - 0.8], [cx + side * 1.6, eyeY + 1]], lit ? 6 : 3, 'head', onSkin);
    // the plane under the cheekbone, running down toward the corner of the mouth
    const deep = a.gaunt ? 2 : 0;
    const under: Point[] = [[cx + side * cheek * 0.95, cheekY + 1.2], [cx + side * (a.mouth.w + 2.4), mouthY - 1], [cx + side * (a.mouth.w + 2), mouthY + 1], [cx + side * jaw * 0.97, mouthY + 0.6]];
    if (deep > 0 || !lit) r.poly(smoothPath(under, 3, true), lit ? 8 - deep : (soft ? 5 : 4) - deep, 'head', onSkin);
    // the fold from the wing of the nose past the corner of the mouth
    if (!a.child) r.path(smoothPath([[cx + side * (a.nose.w + 0.9), nb - 0.8], [cx + side * (a.mouth.w + 1.4), mouthY - 0.6], [cx + side * (a.mouth.w + 1.6), mouthY + 1.4]], 3), crease(r, a.old ? -3 : -1), 'head');
  }
  // the dent under the lower lip, the chin's cleft on a square jaw
  r.ellipse(cx + 0.4, mouthY + a.mouth.low + 1.7, a.mouth.w * 0.45, 0.55, 7, 'head', onSkin);
  if (!soft && a.spec.head.variant === 2) r.line(cx, chin - 2.6, cx, chin - 1.2, crease(r, -2), 'head');
  // the underside of the jaw turns away from the light
  const jawLine = rightOutline(a).filter(([, y]) => y >= mouthY + 1);
  const lower = smoothPath([...mirror(jawLine, cx).reverse().slice(0, -1), ...jawLine], 3);
  r.poly([...lower, ...lower.map(([x, y]): Point => [x, y - 1.3]).reverse()], 5, 'head', onSkin);
  r.poly([...lower.filter(([x]) => x > cx + 1), ...lower.filter(([x]) => x > cx + 1).map(([x, y]): Point => [x, y - 1.6]).reverse()], 3, 'head', onSkin);
}

export function nose(r: Raster, a: Anatomy): void {
  const { cx, browY, noseBottom: nb, nose: n } = a;
  const w = n.w;
  const root = browY + 1.8;
  const mid = (root + nb) / 2;
  // the bridge in light; the side in shade, bulging on a hooked nose; its shadow cast on the cheek
  r.poly(smoothPath([[cx - 0.9, root], [cx + 0.1, root], [cx + 0.3 + n.hook * 0.4, mid], [cx + 0.2, nb - 2.4], [cx - 1, nb - 2.4], [cx - 1.1, mid]], 3, true), 10, 'head');
  r.poly(smoothPath([[cx + 0.4, root + 0.4], [cx + 1.4 + n.hook * 0.6, mid], [cx + w * 0.95, nb - 1.6], [cx + 0.6, nb - 2.2]], 3, true), 5, 'head');
  r.poly([[cx + w * 0.9, nb - 3.5], [cx + w + 2.6, nb - 0.6], [cx + w + 0.8, nb + 0.4]], 4, 'head', onSkin);
  r.poly(smoothPath([[cx - 1, root + 1], [cx - w * 0.8, nb - 2], [cx - 1, nb - 2.4]], 3, true), 8, 'head');
  // the ball of the tip with a spark of light, the wings, the shadow under it, the nostrils
  r.ellipse(cx - 0.2, nb - 1.5 - n.up * 0.4, w * 0.55, 1.35, 9, 'head');
  r.set(cx - 0.8, nb - 2.2 - n.up * 0.4, 11, 'nose');
  r.ellipse(cx - w * 0.72, nb - 0.9, 1.1, 0.95, 8, 'head');
  r.ellipse(cx + w * 0.72, nb - 0.9, 1.1, 0.95, 5, 'head');
  r.poly(smoothPath([[cx - w * 0.9, nb - 0.3], [cx, nb + 0.2], [cx + w * 0.9, nb - 0.3], [cx + w * 0.6, nb + 0.9], [cx - w * 0.6, nb + 0.9]], 3, true), 4, 'head', onSkin);
  r.ellipse(cx - w * 0.38, nb - 0.35 - n.up * 0.3, 0.6, 0.38 + n.up * 0.2, 2, 'nose');
  r.ellipse(cx + w * 0.38, nb - 0.35 - n.up * 0.3, 0.6, 0.38 + n.up * 0.2, 1, 'nose');
}

/** The eye opening at u (−1 inner corner … 1 outer corner): top and bottom edges. */
function lids(a: Anatomy, u: number): { up: number; low: number } {
  const { eye, mood } = a;
  const droop = eye.droop * Math.max(0, u) * 0.7;
  const k = Math.max(0, 1 - u * u);
  const open = mood.open * (1 - eye.lid * 0.2) * (a.spec.illness > 1 ? 0.8 : 1);
  return {
    up: a.eyeY + droop - eye.h * open * k ** 0.6 * (1 - 0.15 * u),
    low: a.eyeY + droop + eye.h * 0.55 * k ** 0.8 - mood.lower * eye.h * 0.4 * k,
  };
}

export function eyes(r: Raster, a: Anatomy): void {
  const { eye, mood } = a;
  for (const side of [-1, 1]) {
    if ((side < 0 && a.spec.eyepatch === 'left') || (side > 0 && a.spec.eyepatch === 'right')) continue;
    const lit = side < 0;
    const ex = a.cx + side * a.eyeOff;
    const at = (u: number) => ex + side * u * eye.w;
    const us = Array.from({ length: 13 }, (_, i) => -1 + i / 6);
    const upper: Point[] = us.map((u) => [at(u), lids(a, u).up]);
    const lower: Point[] = us.map((u) => [at(u), lids(a, u).low]);
    if (mood.open <= 0.05) {
      // closed: the lid and its lashes curve down
      r.path(us.map((u): Point => [at(u), a.eyeY + eye.h * 0.3 * (1 - u * u)]), 2, 'eyes');
      continue;
    }
    // the white, the iris and pupil, a spark of light; the lid shades the top of the eye
    r.poly([...upper, ...lower.slice().reverse()], lit ? 9 : 6, 'eyes');
    const ix = ex + side * 0.1;
    const iy = a.eyeY + mood.gaze * eye.h * 0.5 + 0.15;
    const inEye = (o: string) => o === 'eyes';
    r.ellipse(ix, iy, eye.iris, eye.iris, lit ? 3 : 2, 'eyes', inEye);
    r.ellipse(ix, iy, eye.iris * 0.5, eye.iris * 0.5, 0, 'eyes', inEye);
    r.path(upper.map(([x, y]): Point => [x, y + 0.6]).slice(2, -2), (px, py) => (r.ownerPx(px, py) === 'eyes' ? Math.max(0, r.shadePx(px, py) - 2) : null), 'eyes');
    r.set(ix - 0.5, iy - 0.6, 11, 'eyes');
    // the lash line, heavier toward the outer corner; the fold of the lid above it; a faint lower lid
    r.path(upper, 1, 'eyes');
    r.path(upper.filter((_, i) => us[i]! > 0.2).map(([x, y]): Point => [x, y - 0.6]), 1, 'eyes');
    if (a.female) r.line(at(1), lids(a, 1).up, at(1.35), lids(a, 1).up - 0.9, 1, 'eyes');
    r.path(us.filter((u) => u > -0.7 && u < 0.9).map((u): Point => [at(u), lids(a, u).up - 1.3 - eye.lid * 0.2]), crease(r, -2), 'head');
    r.path(us.filter((u) => u > -0.6 && u < 0.8).map((u): Point => [at(u), lids(a, u).low + 0.5]), crease(r, -1), 'head');
    if (a.spec.illness > 0 || a.old) r.path(us.filter((u) => u > -0.5 && u < 0.7).map((u): Point => [at(u), lids(a, u).low + 1.6]), crease(r, a.spec.illness > 0 ? -2 : -1), 'head');
    if (mood.tears && lit) r.line(at(-0.4), lids(a, -0.4).low + 0.6, at(-0.45), lids(a, -0.4).low + 3.5, 11, 'eyes');
  }
}

export function brows(r: Raster, a: Anatomy, litTone: number, shadeTone: number): void {
  const b = a.brow;
  const lift = a.mood.brows + (a.spec.expression === 'neutral' && a.spec.temper < 0 ? 0.6 : 0);
  const th0 = b.th * (a.female ? 0.7 : 1) + (a.female || a.child ? 0 : 0.2);
  for (const side of [-1, 1]) {
    const ex = a.cx + side * a.eyeOff;
    const x0 = a.cx + side * 1.5;
    const x1 = ex + side * (a.eye.w + 1.4) * b.len + side * a.spec.brows.dx * 0.3;
    const top: Point[] = [];
    const bottom: Point[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = x0 + (x1 - x0) * t;
      const y = a.browY - b.arch * (1 - ((t - 0.55) / 0.55) ** 2) + b.slope * Math.max(0, t - 0.6) * 2 + lift * 0.9 * (1 - t) ** 2;
      const th = th0 * (1 - 0.6 * t ** 1.5);
      top.push([x, y - th / 2]);
      bottom.push([x, y + th / 2]);
    }
    r.poly([...top, ...bottom.reverse()], side < 0 ? litTone : shadeTone, 'brows');
  }
}

export function mouth(r: Raster, a: Anatomy): void {
  const { cx, mood, female } = a;
  const m = a.mouth;
  const w = m.w * (mood.pressed ? 0.92 : 1);
  const ss = Array.from({ length: 13 }, (_, i) => -1 + i / 6);
  const line = (s: number) => a.mouthY - mood.curve * s * s * 1.2 - mood.smirk * Math.max(0, s) ** 2 * 1.4;
  const open = mood.teeth ? 1.1 : mood.slack ? 0.5 : 0;
  const up = m.up * (mood.pressed ? 0.35 : 1);
  const low = m.low * (mood.pressed ? 0.35 : 1);
  const x = (s: number) => cx + s * w;
  // the upper lip faces down and is in shade; a bow in the middle
  const bow = (s: number) => 0.3 * Math.exp(-((s * 5) ** 2)) - 0.15 * Math.exp(-(((Math.abs(s) - 0.3) * 6) ** 2));
  const upper: Point[] = ss.map((s) => [x(s), line(s) - up * Math.max(0, 1 - s * s) ** 0.5 + bow(s)]);
  r.poly([...upper, ...ss.slice().reverse().map((s): Point => [x(s), line(s)])], female ? 4 : 6, 'mouth');
  r.poly([...upper.filter(([px]) => px > cx), ...ss.filter((s) => s > 0).reverse().map((s): Point => [x(s), line(s)])], female ? 3 : 4, 'mouth');
  // the lower lip catches the light
  const lowS = ss.filter((s) => Math.abs(s) < 0.95);
  const lowerLip: Point[] = [...lowS.map((s): Point => [x(s), line(s) + open]), ...lowS.slice().reverse().map((s): Point => [x(s), line(s) + open + low * Math.max(0, 1 - s * s) ** 0.6])];
  r.poly(lowerLip, female ? 6 : 8, 'mouth');
  r.poly([...lowS.filter((s) => s > 0.1).map((s): Point => [x(s), line(s) + open]), ...lowS.filter((s) => s > 0.1).reverse().map((s): Point => [x(s), line(s) + open + low * Math.max(0, 1 - s * s) ** 0.6])], female ? 5 : 6, 'mouth');
  r.path(lowS.filter((s) => s < -0.1 && s > -0.7).map((s): Point => [x(s), line(s) + open + low * 0.45]), female ? 7 : 9, 'mouth');
  if (open > 0) {
    // lips apart: the dark of the mouth, teeth along the top when they show
    r.poly([...ss.slice(1, -1).map((s): Point => [x(s * 0.92), line(s) - 0.1]), ...ss.slice(1, -1).reverse().map((s): Point => [x(s * 0.92), line(s) + open])], 1, 'mouth');
    if (mood.teeth) r.poly([...ss.slice(2, -2).map((s): Point => [x(s * 0.85), line(s) + 0.05]), ...ss.slice(2, -2).reverse().map((s): Point => [x(s * 0.85), line(s) + open * 0.5])], 10, 'mouth');
  }
  // the line between the lips and the corners
  r.path(ss.map((s): Point => [x(s), line(s)]), 2, 'mouth');
  for (const s of [-1, 1]) r.line(x(s), line(s), x(s * 1.08), line(s) + (mood.curve < 0 ? 0.5 : -0.2), 3, 'mouth');
}

export function mole(r: Raster, a: Anatomy): void {
  if (a.spec.beauty < 0) r.ellipse(a.cx + a.hw * 0.42, a.noseBottom + 0.8, 0.5, 0.5, 2, 'mole');
}

/** Lines of age, drawn as creases into the skin, soft and broken, never one bar across the brow. */
export function wrinkles(r: Raster, a: Anatomy): void {
  const w = a.spec.wrinkles;
  if (!w) return;
  const { cx, browY, eyeY, mouthY, chin } = a;
  const depth = w.level >= 3 ? -2 : -1;
  const lines = w.level >= 3 ? 3 : w.level >= 2 ? 2 : 1;
  for (let i = 0; i < lines; i++) {
    const y = browY - 3.6 - i * 2 + w.dy * 0.4;
    for (const side of [-1, 1]) {
      // two short arcs, one each side of the middle, apart above the nose
      const inner = cx + side * (1.4 + (w.variant === 1 ? 1 : 0));
      const outer = cx + side * (7 - i + w.dx * 0.6);
      const bend = w.variant === 2 ? -0.6 : 0.4;
      r.path(smoothPath([[inner, y + 0.2], [(inner + outer) / 2, y - bend], [outer, y + 0.4]], 3), crease(r, depth), 'wrinkles');
    }
  }
  if (w.level >= 2) {
    for (const side of [-1, 1]) {
      const ox = cx + side * (a.eyeOff + a.eye.w + 0.6);
      for (const k of [-0.8, 0.6]) r.line(ox, eyeY + k * 0.6, ox + side * 1.8, eyeY + k * 1.6, crease(r, depth), 'wrinkles');
    }
  }
  if (w.level >= 3) {
    // jowls and the lines of the neck
    for (const side of [-1, 1]) r.path(smoothPath([[cx + side * (a.mouth.w + 2), mouthY + 1.6], [cx + side * (a.mouth.w + 2.6), mouthY + 4], [cx + side * (a.chinW + 2), chin - 1]], 3), crease(r, -1), 'wrinkles');
  }
}

/** Pallor of illness and death: the skin lighter and flatter. */
export function pallor(r: Raster, a: Anatomy): void {
  if (a.spec.illness === 0 && !a.spec.dead) return;
  for (let i = 0; i < r.shades.length; i++) {
    if (r.owner[i] === 'head' || r.owner[i] === 'ears' || r.owner[i] === 'neck') r.shades[i] = Math.min(10, Math.round(r.shades[i]! * 0.75 + 2.5));
  }
}
