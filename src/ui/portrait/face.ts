import { headHalf, type Geometry } from './geometry';
import { LIGHT_DIR, clamp, gauss, inEllipse, lambert, segDist, smooth, type Sample } from './shape';

/**
 * The face as relief (4.12, D-305): a height above the plane at every point inside the head — the skull, the brow
 * ridge, deep eye sockets with the eyeballs, a nose that rises from between the brows, cheekbones, lips and chin.
 * The skin is lit by the normals of that relief, so the parts are one surface and shade together.
 */

/** The line between the lips at x, and how far along the mouth x is (−1..1). */
export function mouthLine(g: Geometry, x: number): { y: number; s: number } {
  const m = g.mouth;
  const w = m.w * (g.x.pressed ? 0.92 : 1) * (g.spec.expression === 'shame' ? 0.85 : 1);
  const s = (x - g.cx) / w;
  const sc = clamp(s, -1.15, 1.15);
  const curve = g.x.curve - (g.spec.expression === 'neutral' || g.spec.expression === 'dead' ? m.rest : 0) - (g.old ? 0.35 : 0);
  return { y: g.mouthY - curve * sc * sc * 1.2 - g.x.smirk * Math.max(0, sc) ** 2 * 1.4, s };
}

export function faceHeight(g: Geometry, x: number, y: number): number {
  const half = headHalf(g, y);
  if (half <= 0) return 0;
  const u = clamp((x - g.cx) / half, -1, 1);
  const t = clamp((y - g.cy) / g.ry, -1, 1);
  let h = g.rx * 0.9 * Math.sqrt(1 - u * u) * (0.62 + 0.38 * Math.sqrt(1 - t * t));
  const { cx, eyeY, eyeSep, eye, nose, browY, noseBottom, mouthY, mouth } = g;
  const male = !g.female && !g.child;
  // brow ridge and temples
  h += (male ? 1.3 : 0.7) * gauss(x, y, cx, browY + 0.4, eyeSep + eye.w + 0.5, 1.8);
  for (const side of [-1, 1]) {
    h -= 0.7 * gauss(x, y, cx + side * g.rx * 0.88, browY - 2, 2.5, 3);
    const ex = cx + side * eyeSep;
    // the socket, deep, and the eyeball in it
    h -= 2.3 * gauss(x, y, ex - side * 0.6, eyeY - 0.5, eye.w + 1.2, eye.h + 1.7);
    const r = Math.hypot((x - ex) / (eye.w * 1.1), (y - eyeY) / (eye.w * 0.85));
    if (r < 1) h += 1.3 * (1 - r * r) ** 1.6;
    // cheekbones, raised by a smile
    h += (0.8 + 0.7 * g.x.cheeks) * gauss(x, y, cx + side * g.rx * 0.55, eyeY + 4 - g.x.cheeks * 0.6, 4.2, 3.2);
    // hollow cheeks of the ill, the old and the dead
    if (g.spec.illness > 1 || g.spec.dead || g.old) h -= (g.old ? 0.6 : 1.2) * gauss(x, y, cx + side * g.rx * 0.62, mouthY - 2.5, 2.2, 3);
    // nasolabial folds: deep with age, faint on everyone else; a smile deepens them
    const fold = segDist(x, y, cx + side * (nose.w + 0.8), noseBottom - 1.2, cx + side * (mouth.w + 1.3), mouthY + 1.4);
    const depth = (g.spec.wrinkles?.level ?? 0) * 0.25 + 0.15 + 0.35 * g.x.cheeks;
    if (!g.child) h -= depth * Math.exp(-((fold.d / 0.9) ** 2));
  }
  // the nose: a ridge from between the brows to the tip, hooked on some, wings and a ball at the tip
  const root = browY + 1.2;
  const tip = noseBottom - 1.2;
  const n = (y - root) / (tip - root);
  if (n > -0.3 && n < 1.35) {
    const lift = clamp(n);
    const profile = (1.7 + (nose.proj - 0.8) * lift ** 1.2 + nose.hook * Math.sin(Math.PI * clamp(n)) * 0.8) * smooth(-0.3, 0.1, n) * (1 - smooth(1, 1.3, n));
    const width = 0.9 + 1.4 * lift * lift * (nose.w / 2.4);
    const cross = Math.max(0, 1 - ((x - cx) / width) ** 2);
    h += profile * cross ** 0.7;
  }
  h += 1.1 * gauss(x, y, cx, tip, 1.5, 1.3);
  for (const side of [-1, 1]) h += 1.5 * gauss(x, y, cx + side * nose.w * 0.62, noseBottom - 1, 1.3, 1.1);
  // lips, the groove between them, the dent under the lower lip, the chin
  const { y: ly, s } = mouthLine(g, x);
  if (Math.abs(s) < 1.25) {
    const k = Math.max(0, 1 - s * s);
    h += (0.6 + mouth.up * 0.5) * k * gauss(0, y, 0, ly - 0.8 - mouth.up * 0.3, 1, 1 + mouth.up * 0.3);
    h += (0.6 + mouth.low * 0.5) * k * gauss(0, y, 0, ly + 0.9 + mouth.low * 0.4 + g.x.open, 1, 0.8 + mouth.low * 0.35);
    h -= 0.45 * Math.exp(-(((y - ly) / 0.5) ** 2)) * Math.max(0, 1 - s * s * 0.6);
  }
  h -= 0.25 * gauss(x, y, cx, noseBottom + 1, 0.7, 1.2);
  h -= 0.6 * gauss(x, y, cx, mouthY + mouth.low + 2.3 + g.x.open, mouth.w * 0.8, 0.8);
  h += (male ? 1.5 : 1) * gauss(x, y, cx, g.chin - 2.8, g.rx * g.head.chin + 1, 2.2);
  return h;
}

/** Skin lit by the relief: `h` is the height here, the others the heights one sample step around. */
export function skin(g: Geometry, c: Sample, h: number, hl: number, hr: number, hu: number, hd: number, step: number): void {
  const dx = (hr - hl) / (2 * step);
  const dy = (hd - hu) / (2 * step);
  const len = Math.hypot(dx, dy, 1);
  const diffuse = clamp((-dx * LIGHT_DIR[0] - dy * LIGHT_DIR[1] + LIGHT_DIR[2]) / len);
  // hollows hold shadow
  const cavity = clamp(((hl + hr + hu + hd - 4 * h) / (step * step)) * 0.06, -0.15, 0.25);
  let t = 0.04 + 0.92 * diffuse - cavity;
  if (g.spec.illness > 0 || g.spec.dead) t = t * 0.82 + 0.16;
  c.put(1, t, 'head');
}

/** Small soft line drawn into the skin. */
function crease(c: Sample, d: number, width: number, depth: number): void {
  if (d < width) c.tone -= depth * (1 - d / width);
}

export function wrinkles(g: Geometry, c: Sample, x: number, y: number): void {
  const w = g.spec.wrinkles;
  if (!w) return;
  const lines = w.level >= 3 ? 3 : w.level >= 2 ? 2 : 1;
  const ad = Math.abs(x - g.cx);
  for (let i = 0; i < lines; i++) {
    const fy = g.browY - 3.2 - i * 2 + w.dy * 0.4;
    const span = 7 - i * 1.3 + w.dx * 0.6;
    if (ad > span || (w.variant === 1 && ad < 1.2)) continue;
    const bend = w.variant === 2 ? -1 * (ad / span) ** 2 : 0.5 * (ad / span) ** 2;
    crease(c, Math.abs(y - (fy + bend)), 0.75, 0.13 * smooth(span, span - 2, ad));
  }
  if (w.level < 2) return;
  for (const side of [-1, 1]) {
    // crow's feet and a line under the eye
    const ox = g.cx + side * (g.eyeSep + g.eye.w + 0.7);
    for (const k of [-1, 0, 1]) crease(c, segDist(x, y, ox, g.eyeY + k * 0.8, ox + side * 2.2, g.eyeY + k * 1.7).d, 0.6, 0.12);
    const ux = g.cx + side * g.eyeSep;
    if (Math.abs(x - ux) < g.eye.w) crease(c, Math.abs(y - (g.eyeY + g.eye.h + 1.9 + 0.5 * ((x - ux) / g.eye.w) ** 2)), 0.6, 0.09);
  }
}

export function eyes(g: Geometry, c: Sample, x: number, y: number): void {
  const { eye, x: ex, spec } = g;
  for (const side of [-1, 1]) {
    if ((side < 0 && spec.eyepatch === 'left') || (side > 0 && spec.eyepatch === 'right')) continue;
    const cx = g.cx + side * g.eyeSep;
    const u = ((x - cx) * side) / eye.w;
    if (Math.abs(u) > 1.3 || Math.abs(y - g.eyeY) > 5) continue;
    const k = Math.max(0, 1 - u * u);
    // the opening is an almond: its highest point toward the nose, the outer corner drooping a little
    const yc = g.eyeY + eye.droop * Math.max(0, u) * 0.8;
    const open = ex.eyes * (0.9 - eye.lid * 0.22) * (spec.illness > 1 ? 0.8 : 1);
    const peak = k ** 0.65 * (1 - 0.18 * u);
    const upper = yc - eye.h * open * peak;
    const lower = yc + eye.h * 0.55 * k ** 0.9 - ex.lowerLid * eye.h * 0.45 * k;
    // the dark rings of illness
    if (spec.illness > 0 && Math.abs(u) < 1.05) crease(c, Math.abs(y - (yc + eye.h + 1.4 + 0.35 * u * u)), 1.3, 0.14 * spec.illness);
    if (Math.abs(u) > 1) {
      if (g.female && u > 0 && ex.eyes > 0 && Math.abs(y - (upper - (u - 1) * 1.6)) < 0.5) c.put(1, 0.1, 'eyes');
      continue;
    }
    if (ex.eyes <= 0.05) {
      // closed: the lid and its lashes curve down
      if (Math.abs(y - (yc + 0.25 * eye.h * k)) < 0.42 + 0.2 * k) c.put(1, 0.15, 'eyes');
      continue;
    }
    if (y > upper && y < lower) {
      let t = 0.86 - 0.14 * smooth(0.35, 1, Math.abs(u));
      const ix = cx + side * 0.15;
      const iy = yc + ex.gaze * eye.h * 0.55 - 0.05;
      const r = Math.hypot(x - ix, y - iy);
      if (r < eye.iris) t = 0.3 + 0.1 * (r / eye.iris) - (r > eye.iris * 0.78 ? 0.1 : 0);
      if (r < eye.iris * 0.45) t = 0.05;
      if (Math.hypot(x - ix + 0.45, y - iy + 0.45) < 0.36) t = 1;
      // the lid shades the top of the eye
      t -= 0.22 * smooth(upper + 0.9, upper, y);
      c.put(1, t, 'eyes');
    }
    // lashes along the upper lid, heavier toward the outer corner
    const lash = 0.42 + 0.25 * Math.max(0, u) + (g.female ? 0.22 : 0);
    if (Math.abs(y - upper) < lash) c.put(1, 0.08, 'eyes');
    if (Math.abs(y - lower) < 0.3 && Math.abs(u) < 0.85) c.tone -= 0.1;
    // the fold of the upper lid
    const fold = upper - 1.35 - 0.2 * k + eye.lid * 0.5;
    if (Math.abs(y - fold) < 0.4 && Math.abs(u) < 0.9) c.tone -= 0.15;
    if (ex.tears && Math.abs(u + 0.55) < 0.16 && y > lower && y < lower + 4.5) c.put(1, 0.96, 'eyes');
  }
}

export function brows(g: Geometry, c: Sample, x: number, y: number, hairTone: number): void {
  const b = g.brow;
  const spec = g.spec;
  // a wrathful or proud temper lowers the brows at rest; a calm one leaves them be
  const inner = g.x.brows + (spec.expression === 'neutral' && spec.temper < 0 ? 0.8 : 0);
  for (const side of [-1, 1]) {
    const ex = g.cx + side * g.eyeSep;
    const len = g.eye.w + 1.6 + spec.brows.dx * 0.3;
    const bx = ex + side * 0.4;
    const u = ((x - bx) * side) / len;
    if (u < -1 || u > 1) continue;
    const by = g.browY - b.arch * (1 - (u - 0.15) ** 2) + b.slope * Math.max(0, u) ** 2 + inner * Math.max(0, -u) * 0.8 + inner * 0.25;
    const th = (b.th + (g.female ? -0.25 : 0.3)) * (1 - 0.5 * Math.max(0, u)) * (u < -0.85 ? 0.7 : 1);
    const d = Math.abs(y - by);
    if (d < th / 2) c.put(1, hairTone + 0.05 * Math.abs(u) + 0.12 * (d / (th / 2)) ** 2, 'brows');
  }
}

export function mouth(g: Geometry, c: Sample, x: number, y: number): void {
  const m = g.mouth;
  const { y: ly, s } = mouthLine(g, x);
  if (Math.abs(s) > 1.1) return;
  const k = Math.max(0, 1 - s * s);
  const fem = g.female ? 1 : 0;
  const open = g.x.open * k ** 0.6;
  // the coloured lips: an upper lip with a bow, a fuller lower lip
  const up = (m.up + 0.25 * fem) * (g.x.pressed ? 0.35 : 1);
  const low = (m.low + 0.3 * fem) * (g.x.pressed ? 0.45 : 1);
  const bow = 0.35 * Math.exp(-((s * 4) ** 2)) - 0.25 * Math.exp(-(((Math.abs(s) - 0.28) * 6) ** 2));
  const upTop = ly - up * k ** 0.45 - 0.2 + bow;
  const lowBottom = ly + open + low * k ** 0.5 + 0.2;
  if (Math.abs(s) <= 1 && y > upTop && y < lowBottom) c.tone -= (0.02 + 0.07 * fem) * (y < ly ? 1.4 : 0.8);
  if (open > 0.15 && y > ly - open * 0.35 && y < ly + open) {
    const teeth = g.x.teeth && y < ly - open * 0.35 + open * 0.6 && Math.abs(s) < 0.8;
    c.put(1, teeth ? 0.82 - 0.12 * Math.abs(s) : 0.08, 'mouth');
    return;
  }
  const lw = 0.36 + 0.14 * (1 - k) + (g.x.pressed ? 0.12 : 0);
  if (Math.abs(y - ly) < lw) c.put(1, 0.12, 'mouth');
}

export function mole(g: Geometry, c: Sample, x: number, y: number): void {
  if (g.spec.beauty >= 0) return;
  if (Math.hypot(x - (g.cx + g.rx * 0.42), y - (g.noseBottom + 0.5)) < 0.65) c.put(1, 0.12, 'mole');
}

export function ears(g: Geometry, c: Sample, x: number, y: number): void {
  const e = g.ear;
  for (const side of [-1, 1]) {
    const ex = g.cx + side * (headHalf(g, g.earY) + e.out * 0.35);
    if (!inEllipse(x, y, ex, g.earY, e.out, e.h / 2)) continue;
    // the rim of the ear catches light, the bowl inside is in shade
    const bowl = inEllipse(x, y, ex + side * 0.15, g.earY + 0.3, e.out * 0.55, e.h * 0.3);
    const lit = side < 0 ? 0.56 : 0.34;
    c.put(1, lit - (bowl ? 0.2 : 0) - 0.12 * smooth(0.7, 1, Math.hypot((x - ex) / e.out, (y - g.earY) / (e.h / 2))), 'ears');
  }
}

export function neck(g: Geometry, c: Sample, x: number, y: number): void {
  const w = g.neckHalf + Math.max(0, y - g.shoulders) * 0.6;
  if (y < g.chin - 6 || y > g.shoulders + 4 || Math.abs(x - g.cx) > w) return;
  let t = 0.12 + 0.7 * lambert(((x - g.cx) / w) * 0.95, 0.1);
  // the jaw casts its shadow down the neck
  t -= 0.32 * smooth(g.chin + 3.5, g.chin, y);
  // an Adam's apple, the cords of an old neck
  if (!g.female && !g.child) t += 0.08 * gauss(x, y, g.cx - 0.4, g.chin + 3, 1, 1.2);
  if (g.old) t -= 0.1 * Math.exp(-(((Math.abs(x - g.cx) - g.neckHalf * 0.45) / 0.7) ** 2)) * smooth(g.chin + 1, g.chin + 4, y);
  c.put(1, t, 'neck');
}
