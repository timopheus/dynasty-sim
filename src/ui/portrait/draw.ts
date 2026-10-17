import type { FaceSpec, Part } from '../../core/looks';
import { SHADES, shadeOf, type Grid } from './grid';

/**
 * The portrait as a grid of shades (4.12, D-300, D-304), drawn only from `FaceSpec`. A small "shader": every pixel is
 * the average of 3×3 samples, every sample the tone (0 ink .. 1 paper) of the layers that cover it, lit from the
 * upper left. Then the tone is cut to one of `SHADES` shades, without dithering. Pure: the same spec gives the same
 * pixels.
 */

export const PORTRAIT_WIDTH = 64;
export const PORTRAIT_HEIGHT = 80;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** 1 in the middle of an ellipse, fading to 0 at its edge. */
const blob = (x: number, y: number, bx: number, by: number, rx: number, ry: number) => 1 - smooth(0, 1, Math.hypot((x - bx) / rx, (y - by) / ry));
const inEllipse = (x: number, y: number, bx: number, by: number, rx: number, ry: number) => ((x - bx) / rx) ** 2 + ((y - by) / ry) ** 2 <= 1;

/** Distance from a point to a segment, and where along the segment (0..1) the nearest point lies. */
function segDist(x: number, y: number, x0: number, y0: number, x1: number, y1: number): { d: number; t: number } {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const t = clamp(((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy));
  return { d: Math.hypot(x - x0 - vx * t, y - y0 - vy * t), t };
}

/** Light from the upper left and the front. */
const LIGHT_DIR = (() => {
  const v = [-0.5, -0.6, 0.62];
  const n = Math.hypot(v[0]!, v[1]!, v[2]!);
  return v.map((c) => c / n) as [number, number, number];
})();

function lambert(nx: number, ny: number): number {
  const nz = Math.sqrt(Math.max(0.04, 1 - nx * nx * 0.85 - ny * ny * 0.4));
  return clamp(nx * LIGHT_DIR[0] + ny * LIGHT_DIR[1] + nz * LIGHT_DIR[2]);
}

/** How a mood moves the face: mouth, eyes and brows (D-177). */
interface Expression {
  /** Lift of the mouth corners (+ smile, − frown). */
  curve: number;
  /** Lift of the right corner only: a one-sided grin. */
  smirk: number;
  /** How far the lips part, in pixels; teeth may show inside. */
  open: number;
  teeth: boolean;
  /** Lips pressed thin. */
  pressed: boolean;
  /** Openness of the eyes, 0 closed .. 1. */
  eyes: number;
  /** Lower lids raised by a smile or a wince. */
  lowerLid: number;
  /** Look down (+). */
  gaze: number;
  /** Inner ends of the brows: + down (anger), − up (grief). */
  brows: number;
  tears: boolean;
}

const EXPRESSIONS: Record<string, Expression> = {
  neutral: { curve: 0, smirk: 0, open: 0, teeth: false, pressed: false, eyes: 1, lowerLid: 0, gaze: 0, brows: 0, tears: false },
  joy: { curve: 1.6, smirk: 0, open: 0.8, teeth: true, pressed: false, eyes: 0.75, lowerLid: 0.6, gaze: 0, brows: -0.4, tears: false },
  triumph: { curve: 0.3, smirk: 1.8, open: 0, teeth: false, pressed: false, eyes: 0.8, lowerLid: 0.3, gaze: 0, brows: 0.5, tears: false },
  threat: { curve: -0.3, smirk: 0, open: 0, teeth: false, pressed: true, eyes: 0.6, lowerLid: 0.2, gaze: 0, brows: 1.3, tears: false },
  pain: { curve: -0.9, smirk: 0, open: 1.4, teeth: true, pressed: false, eyes: 0.2, lowerLid: 0.5, gaze: 0, brows: -1.4, tears: false },
  loss: { curve: -1.3, smirk: 0, open: 0, teeth: false, pressed: false, eyes: 0.75, lowerLid: 0, gaze: 0.6, brows: -1.6, tears: true },
  shame: { curve: -0.6, smirk: 0, open: 0, teeth: false, pressed: true, eyes: 0.5, lowerLid: 0, gaze: 1.2, brows: -0.8, tears: false },
  anger: { curve: -0.7, smirk: 0, open: 1, teeth: true, pressed: false, eyes: 0.65, lowerLid: 0.3, gaze: 0, brows: 2, tears: false },
  dead: { curve: -0.4, smirk: 0, open: 0.5, teeth: false, pressed: false, eyes: 0, lowerLid: 0, gaze: 0, brows: 0, tears: false },
};

/** Eyes: half width, half height, outer corner up (+), iris radius, heavy lid. */
const EYES = [
  { w: 3.4, h: 1.7, tilt: 0, iris: 1.35, lid: 0 },
  { w: 3.6, h: 1.4, tilt: -0.2, iris: 1.35, lid: 0.8 },
  { w: 3.0, h: 2.0, tilt: 0, iris: 1.45, lid: 0 },
  { w: 3.8, h: 1.8, tilt: -0.6, iris: 1.5, lid: 0.3 },
  { w: 3.5, h: 1.3, tilt: 0.7, iris: 1.15, lid: 0.2 },
];
/** Brows: thickness, arch, slope of the outer end (+ down). */
const BROWS = [
  { th: 1.4, arch: 0.6, slope: 0 },
  { th: 1.0, arch: 1.7, slope: 0.3 },
  { th: 2.3, arch: 0.3, slope: 0 },
  { th: 1.4, arch: 0.5, slope: 1.3 },
];
/** Nose: half width of the wings, hook of the bridge, length change, tip up (+). */
const NOSES = [
  { w: 2.6, hook: 0, len: 0, up: 0 },
  { w: 2.6, hook: 1.3, len: 0.5, up: -0.5 },
  { w: 3.7, hook: 0, len: -0.5, up: 0 },
  { w: 2.2, hook: -0.5, len: -2.2, up: 1 },
  { w: 2.1, hook: 0.3, len: 1.8, up: -0.3 },
];
/** Mouth: half width, upper and lower lip, a frown it keeps at rest. */
const MOUTHS = [
  { w: 4.2, up: 1.0, low: 1.3, rest: 0 },
  { w: 5.2, up: 0.6, low: 0.9, rest: 0 },
  { w: 3.9, up: 1.4, low: 1.9, rest: 0 },
  { w: 4.8, up: 0.7, low: 1.1, rest: -0.5 },
];
/** Ears: height and how far they stand out. */
const EARS = [
  { h: 6, out: 1.8 },
  { h: 8, out: 2.1 },
  { h: 6.5, out: 3.1 },
];
/** Tone of hair, brows and beard by greyness: dark, flecked, grey, white. */
const GREY_TONE = [0.06, 0.2, 0.5, 0.82];

interface Geometry {
  spec: FaceSpec;
  x: Expression;
  female: boolean;
  child: boolean;
  old: boolean;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  top: number;
  chin: number;
  eyeY: number;
  eyeSep: number;
  eye: (typeof EYES)[number];
  browY: number;
  brow: (typeof BROWS)[number];
  noseX: number;
  noseBottom: number;
  nose: (typeof NOSES)[number];
  mouthX: number;
  mouthY: number;
  mouth: (typeof MOUTHS)[number];
  ear: (typeof EARS)[number];
  hairline: number;
  shoulders: number;
  neckHalf: number;
}

function geometry(spec: FaceSpec): Geometry {
  const child = spec.stage === 'child';
  const female = spec.sex === 'female';
  const old = spec.stage === 'old';
  const rx = (child ? 13.5 : female ? 15 : 16.3) + spec.headWidth * 1.4;
  const ry = (child ? 16.5 : 20.5) + spec.headHeight * 1.4;
  const cx = 32 + spec.head.dx * 1.2;
  const cy = (child ? 43 : 37) + spec.head.dy;
  const eyeBase = EYES[spec.eyes.variant] ?? EYES[0]!;
  const grow = child ? 1.15 : 1;
  const eye = { ...eyeBase, w: eyeBase.w * grow, h: eyeBase.h * (child ? 1.6 : 1.3) + (spec.beauty > 0 ? 0.2 : 0), iris: eyeBase.iris * grow * 1.1 };
  const eyeY = cy + (child ? 0.1 : -0.02) * ry + spec.eyes.dy * 0.9;
  const nose = NOSES[child ? 3 : spec.nose.variant] ?? NOSES[0]!;
  return {
    spec,
    x: EXPRESSIONS[spec.expression] ?? EXPRESSIONS.neutral!,
    female,
    child,
    old,
    cx,
    cy,
    rx,
    ry,
    top: cy - ry,
    chin: cy + ry,
    eyeY,
    eyeSep: rx * 0.41 + spec.eyes.dx * 0.9,
    eye,
    browY: eyeY - (child ? 3.8 : 4.4) + spec.brows.dy * 0.8,
    brow: BROWS[spec.brows.variant] ?? BROWS[0]!,
    noseX: cx + spec.nose.dx * 0.7,
    noseBottom: cy + ry * (child ? 0.27 : 0.36) + nose.len + spec.nose.dy * 0.8,
    nose: { ...nose, w: nose.w + (spec.beauty < 0 ? 0.4 : 0) },
    mouthX: cx + spec.mouth.dx * 0.8,
    mouthY: cy + ry * (child ? 0.5 : 0.57) + spec.mouth.dy * 0.8 + (old ? 0.5 : 0),
    mouth: MOUTHS[spec.mouth.variant] ?? MOUTHS[0]!,
    ear: EARS[spec.ears.variant] ?? EARS[0]!,
    hairline: cy - ry * 0.6 + (spec.hair?.dy ?? 0),
    shoulders: cy + ry + (child ? 3 : 4),
    neckHalf: child ? 4 : female ? 4.4 : 5.4,
  };
}

/** Half width of the head at height y; negative outside it. Four shapes: oval, broad, square jaw, narrow chin. */
function headHalf(g: Geometry, y: number, grow = 0): number {
  const rx = g.rx + grow;
  const ry = g.ry + grow;
  const t = (y - g.cy) / ry;
  if (t < -1 || t > 1) return -1;
  if (t <= 0) return rx * Math.sqrt(1 - Math.abs(t) ** 2.3);
  // a woman's jaw is never square: her fourth shape is the oval
  const variant = g.female && g.spec.head.variant === 2 ? 0 : g.spec.head.variant;
  let w: number;
  switch (variant) {
    case 1:
      w = rx * 1.05 * Math.sqrt(Math.max(0, 1 - t ** 2.6));
      break;
    case 2:
      w = rx * Math.sqrt(Math.max(0, 1 - t ** 5));
      break;
    case 3:
      w = rx * Math.max(0, 1 - t ** 1.5) ** 0.8;
      break;
    default:
      w = rx * Math.sqrt(1 - t * t);
  }
  // jowls of an old man
  if (g.old && !g.female) w += 0.8 * blob(0, t, 0, 0.62, 1, 0.25);
  return w;
}

/** The layers of one sample, painted back to front. */
class Canvas {
  tone = 0;
  owner = 'background';
  put(cover: number, tone: number, owner: string): void {
    if (cover <= 0) return;
    this.tone += (tone - this.tone) * Math.min(1, cover);
    if (cover >= 0.5) this.owner = owner;
  }
}

function background(c: Canvas, x: number, y: number): void {
  // a plain light field, a little darker toward the bottom
  const t = 0.79 - 0.07 * smooth(30, 80, y);
  c.put(1, t, 'background');
}

function hairTone(g: Geometry, x: number, y: number, lit: number, part: Part): number {
  let t = GREY_TONE[g.spec.grey] ?? GREY_TONE[0]!;
  // flecks of grey at the temples
  if (g.spec.grey === 1) t += 0.22 * blob(Math.abs(x - g.cx), y, g.rx * 0.95, g.eyeY - 5, 4, 7);
  const curly = part.variant === 2;
  const angle = Math.atan2(y - (g.top - 8), x - g.cx - part.dx * 2);
  const strands = curly ? 0.07 * Math.cos(x * 1.4) * Math.cos(y * 1.4) : 0.045 * Math.cos(angle * 70);
  // a sheen across the crown, on the lit side
  const sheen = 0.12 * blob(x, y, g.cx - g.rx * 0.35, g.top + 2, g.rx * 0.45, 2.2);
  return t + 0.16 * lit + strands + sheen;
}

function backHair(g: Geometry, c: Canvas, x: number, y: number): void {
  const hair = g.spec.hair;
  if (!hair) return;
  const long = hair.variant === 1 || (g.female && hair.variant !== 4);
  if (long) {
    const bottom = g.chin + (g.female ? 8 : 3) + hair.dx * 1.5;
    const w = g.rx + (g.female ? 3.5 : 2.5);
    const inside = y <= bottom && y >= g.top && (y > g.cy ? Math.abs(x - g.cx) <= w - smooth(bottom - 5, bottom, y) * 3 : inEllipse(x, y, g.cx, g.cy, w, g.ry + 2.5));
    if (inside) c.put(1, hairTone(g, x, y, 0.35 * (1 - (x - g.cx + w) / (2 * w)), hair) - 0.06, 'hair');
  } else if (hair.variant === 4 && !g.female && !g.child) {
    // a queue tied with a ribbon behind the neck
    const bx = g.cx + g.rx * 0.55;
    const by = g.chin - 2;
    if (inEllipse(x, y, bx - 2, by, 2.2, 1.6) || inEllipse(x, y, bx + 2, by, 2.2, 1.6)) c.put(1, 0.2 + 0.2 * blob(x, y, bx - 2.5, by - 0.6, 1.5, 1), 'hair');
  }
}

function body(g: Geometry, c: Canvas, x: number, y: number): void {
  const { spec, cx } = g;
  const st = g.shoulders;
  const half = g.neckHalf + 2 + Math.min(g.child ? 18 : 26, (y - st) * 2.4 + 6 * smooth(st, st + 6, y));
  if (y < st || Math.abs(x - cx) > half) return;
  const dx = (x - cx) / 30;
  const lit = clamp(0.55 - dx * 0.6 - 0.15 * smooth(st, st + 4, y));
  const female = g.female;
  const base = (female ? [0.72, 0.42, 0.33, 0.24] : [0.74, 0.42, 0.3, 0.22])[spec.attire] ?? 0.42;
  // the cloth, with soft folds
  let t = base + 0.18 * (lit - 0.5) * (spec.attire === 0 ? 1.2 : 1);
  t -= 0.06 * smooth(0.6, 1, Math.cos((x - cx) * 0.55 + y * 0.12));
  c.put(1, t, 'attire');
  // the skin of the neckline: a narrow V, a wide low curve for a woman's dress
  const open = female ? 7 : spec.attire === 0 ? 6 : 4;
  const vHalf = (female ? 7.5 : spec.attire === 0 ? 4 : 3) * (1 - (y - st) / open);
  if (y < st + open && Math.abs(x - cx) <= vHalf) c.put(1, 0.62 + 0.25 * lit - 0.12 * smooth(0, 1, (y - st) / open), 'neck');
  const ad = Math.abs(x - cx);
  if (spec.attire === 0) {
    // an open collar and a patch
    if (y < st + open + 1 && Math.abs(ad - vHalf) < 0.7) c.put(1, 0.35, 'attire');
    if (Math.abs(x - (cx + 10)) <= 2.5 && Math.abs(y - (st + 8)) <= 2) c.put(1, Math.abs(x - (cx + 10)) > 1.8 || Math.abs(y - (st + 8)) > 1.4 ? 0.4 : 0.6, 'attire');
    return;
  }
  // a white neckcloth at the throat
  if (!female && y < st + open + 1 && Math.abs(ad - vHalf) < 1.2) c.put(1, 0.86 - 0.1 * dx, 'attire');
  if (spec.attire >= 2) {
    // lapels with a lighter facing and an edge (braided on the grandest coats)
    const lap = vHalf + 3.5 + (y - st) * 0.45;
    const edge = Math.abs(ad - (open + 2 + (y - st) * 1.2));
    if (y > st + 1 && ad > lap - 3 && ad < lap) c.put(1, t + 0.1, 'attire');
    if (y > st + 1 && edge < 0.6) c.put(1, spec.attire >= 3 ? 0.78 : 0.15, 'attire');
    // buttons
    if (!female && y > st + open + 1 && Math.hypot(x - cx - 0.5, ((y - st) % 4) - 2) < 0.9) c.put(1, 0.8, 'attire');
  }
  if (spec.attire >= 3) {
    if (female) {
      // pearls along the neckline and lace on its edge
      for (let i = -3; i <= 3; i++) {
        const px = cx + i * 1.9;
        const py = st + 1.5 + 0.35 * i * i;
        if (Math.hypot(x - px, y - py) < 0.85) c.put(1, Math.hypot(x - px + 0.3, y - py + 0.3) < 0.4 ? 1 : 0.78, 'attire');
      }
      if (y >= st + open - 1 && y < st + open + 1.2 && ad < vHalf + 9) c.put(1, 0.86 + 0.08 * Math.cos(x * 1.6), 'attire');
    } else if (ad < 3.4 - (y - st) * 0.1 && y > st + 1 && y < st + 14) {
      // a lace cravat falling down the chest
      c.put(1, 0.9 - 0.18 * smooth(0.5, 1, Math.cos(y * 1.5 + ad)) - 0.1 * (ad / 3.4), 'attire');
    }
    // braid at the shoulders
    if (Math.abs(y - (st + 7 + ad * 0.12)) < 0.6 && ad > half - 9 && ad < half - 2) c.put(1, 0.8, 'attire');
  }
}

function neck(g: Geometry, c: Canvas, x: number, y: number): void {
  if (y < g.chin - 5 || y > g.shoulders + 2 || Math.abs(x - g.cx) > g.neckHalf) return;
  const dx = (x - g.cx) / g.neckHalf;
  let t = 0.5 + 0.3 * lambert(dx * 0.9, 0.2);
  // the shadow under the jaw, the cords of an old neck
  t -= 0.32 * smooth(g.chin + 4, g.chin - 1, y);
  if (g.old && !g.child) t -= 0.12 * smooth(0.75, 1, Math.cos((x - g.cx) * 0.9)) * smooth(g.chin + 1, g.chin + 4, y);
  c.put(1, t, 'neck');
}

function earY(g: Geometry): number {
  return g.eyeY + 1.5 + g.spec.ears.dy * 0.8;
}

function ears(g: Geometry, c: Canvas, x: number, y: number): void {
  const e = g.ear;
  const ey = earY(g);
  for (const side of [-1, 1]) {
    const ex = g.cx + side * (headHalf(g, ey) + e.out * 0.45 + (g.spec.ears.dx < 0 ? -0.4 : 0));
    if (!inEllipse(x, y, ex, ey, e.out, e.h / 2)) continue;
    const inner = blob(x, y, ex + side * 0.2, ey, e.out * 0.55, e.h * 0.32);
    const lit = side < 0 ? 0.72 : 0.5;
    c.put(1, lit - 0.2 * inner - 0.12 * smooth(0.6, 1, Math.hypot((x - ex) / e.out, (y - ey) / (e.h / 2))), 'ears');
  }
}

function skin(g: Geometry, c: Canvas, x: number, y: number): void {
  const half = headHalf(g, y);
  if (Math.abs(x - g.cx) > half) return;
  const nx = (x - g.cx) / Math.max(half, 1);
  const ny = (y - g.cy) / g.ry;
  let t = 0.38 + 0.56 * lambert(nx, ny);
  const { eyeY, eyeSep, cx, eye } = g;
  // sockets, brow ridge, cheekbones
  for (const side of [-1, 1]) {
    const ex = cx + side * eyeSep;
    t -= 0.2 * blob(x, y, ex, eyeY - 0.6, eye.w + 2, eye.h + 2.2);
    t += 0.07 * blob(x, y, ex, g.browY - 1.5, eye.w + 2, 1.8);
    t += (side < 0 ? 0.08 : 0.03) * blob(x, y, cx + side * g.rx * 0.5, eyeY + g.ry * 0.25, 3.5, 2.2);
  }
  // the edge of the face turns from the light; the chin catches it
  t -= 0.14 * smooth(0.75, 1, Math.abs(nx)) * (nx > 0 ? 1.3 : 0.7);
  t += 0.06 * blob(x, y, g.mouthX - 1, g.chin - 3, 4, 2.5);
  // illness and death: pallor, lower contrast, hollow cheeks
  const ill = g.spec.illness;
  if (ill > 0 || g.spec.dead) t = t * 0.8 + 0.15;
  if (ill > 1 || g.spec.dead) {
    for (const side of [-1, 1]) t -= 0.13 * blob(x, y, cx + side * g.rx * 0.55, g.mouthY - 3, 2.6, 4);
  }
  c.put(1, t, 'head');
}

/** A soft line on skin, darkest at its middle. */
function crease(c: Canvas, d: number, width: number, depth: number): void {
  if (d < width) c.tone -= depth * (1 - d / width);
}

function wrinkles(g: Geometry, c: Canvas, x: number, y: number): void {
  const w = g.spec.wrinkles;
  if (!w || c.owner !== 'head') return;
  const cx = g.cx + w.dx;
  const lines = w.level >= 3 ? 3 : w.level >= 2 ? 2 : 1;
  const ad = Math.abs(x - cx);
  for (let i = 0; i < lines; i++) {
    const fy = g.browY - 4.2 - i * 2.3 + w.dy * 0.7;
    const span = 8 - i * 1.2;
    if (ad > span || (w.variant === 1 && ad < 1.5)) continue;
    const curve = w.variant === 2 ? -1.2 * (ad / span) ** 2 : 0.4 * (ad / span) ** 2;
    crease(c, Math.abs(y - (fy + curve)), 0.9, 0.16 * smooth(span, span - 2, ad));
  }
  if (w.level >= 2) {
    for (const side of [-1, 1]) {
      // crow's feet and a line under the eye
      const ox = g.cx + side * (g.eyeSep + g.eye.w + 0.8);
      for (const k of [-1, 0, 1]) crease(c, segDist(x, y, ox, g.eyeY + k * 0.9, ox + side * 2.4, g.eyeY + k * 1.9).d, 0.7, 0.14);
      const ux = g.cx + side * g.eyeSep;
      if (Math.abs(x - ux) < g.eye.w) crease(c, Math.abs(y - (g.eyeY + g.eye.h + 1.8 + 0.6 * ((x - ux) / g.eye.w) ** 2)), 0.7, 0.1);
    }
  }
  if (w.level >= 3) {
    // folds from the wings of the nose past the corners of the mouth
    for (const side of [-1, 1]) {
      crease(c, segDist(x, y, g.noseX + side * (g.nose.w + 0.6), g.noseBottom - 1, g.mouthX + side * (g.mouth.w + 1.6), g.mouthY + 2.5).d, 1.1, 0.2);
    }
  }
}

function eyes(g: Geometry, c: Canvas, x: number, y: number): void {
  const { eye, x: ex, spec } = g;
  const ill = spec.illness;
  for (const side of [-1, 1]) {
    if ((side < 0 && spec.eyepatch === 'left') || (side > 0 && spec.eyepatch === 'right')) continue;
    const cx = g.cx + side * g.eyeSep;
    const u = ((x - cx) * side) / eye.w;
    if (Math.abs(u) > 1.25) continue;
    const yc = g.eyeY - eye.tilt * u * 0.8;
    const k = Math.max(0, 1 - u * u);
    const open = ex.eyes * (1 - eye.lid * 0.18) * (ill > 1 ? 0.8 : 1);
    const upper = yc - eye.h * open * k ** 0.7 + 0.2;
    const lower = yc + eye.h * 0.6 * k ** 0.9 - ex.lowerLid * eye.h * 0.45 * k;
    // dark rings of illness
    if (ill > 0 && Math.abs(u) < 1) crease(c, Math.abs(y - (yc + eye.h + 1.2 + 0.4 * u * u)), 1.3, 0.16 * ill);
    if (Math.abs(u) > 1) {
      // lashes past the outer corner
      if (g.female && u > 0 && ex.eyes > 0 && Math.abs(y - (upper - (u - 1) * 2)) < 0.6) c.put(1, 0.12, 'eyes');
      continue;
    }
    if (ex.eyes <= 0.05) {
      // a closed eye: the lid line curves down
      if (Math.abs(y - (yc + 0.35 * eye.h * k)) < 0.55 + 0.25 * k) c.put(1, 0.16, 'eyes');
      continue;
    }
    if (y > upper && y < lower) {
      let t = 0.86 - 0.12 * smooth(0.4, 1, Math.abs(u));
      const ix = cx + side * 0.2;
      const iy = yc + ex.gaze * eye.h * 0.6 + 0.15;
      const r = Math.hypot(x - ix, y - iy);
      if (r < eye.iris) t = 0.24 + 0.12 * (r / eye.iris) - (r > eye.iris * 0.8 ? 0.12 : 0);
      if (r < eye.iris * 0.5) t = 0.06;
      if (Math.hypot(x - ix + 0.55, y - iy + 0.55) < 0.42) t = 1;
      // the upper lid casts a shadow on the eye
      t -= 0.25 * smooth(upper + 1.2, upper, y);
      c.put(1, t, 'eyes');
    }
    // the upper lid line, thicker at the outer corner and for women
    const lidW = 0.55 + (u > 0 ? 0.35 * u : 0) + (g.female ? 0.3 : 0);
    if (Math.abs(y - upper) < lidW) c.put(1, 0.1, 'eyes');
    if (Math.abs(y - lower) < 0.4 && Math.abs(u) < 0.9) c.tone -= 0.12;
    // the crease of the lid, low on heavy lids
    if (Math.abs(y - (upper - 1.6 + eye.lid * 0.8)) < 0.45 && Math.abs(u) < 0.85) c.tone -= 0.1;
    if (ex.tears && Math.abs(u + 0.6) < 0.18 && y > lower && y < lower + 4) c.put(1, 0.98, 'eyes');
  }
}

function brows(g: Geometry, c: Canvas, x: number, y: number): void {
  const b = g.brow;
  const spec = g.spec;
  const tone = (GREY_TONE[spec.grey] ?? 0.12) + 0.06;
  const inner = g.x.brows + (spec.expression === 'neutral' ? -spec.temper * 0.9 : 0);
  for (const side of [-1, 1]) {
    const bx = g.cx + side * (g.eyeSep + 0.4) + side * spec.brows.dx * 0.6;
    const len = g.eye.w + 1.6;
    const u = ((x - bx) * side) / len;
    if (Math.abs(u) > 1) continue;
    const by = g.browY - b.arch * (1 - u * u) + b.slope * Math.max(0, u) + inner * Math.max(0, -u) * 0.9 + (u < 0 ? inner * 0.25 : 0);
    const th = (b.th + (g.female ? 0 : 0.4)) * (1 - 0.45 * Math.max(0, u)) * (g.female ? 0.75 : 1);
    if (Math.abs(y - by) < th / 2 + 0.15) c.put(1, tone + 0.06 * Math.abs(u) + 0.04 * Math.cos(x * 2.3), 'brows');
  }
}

function nose(g: Geometry, c: Canvas, x: number, y: number): void {
  const n = g.nose;
  const top = g.eyeY + 0.5;
  const bottom = g.noseBottom;
  if (y < top - 1 || y > bottom + 2.5 || Math.abs(x - g.noseX) > n.w + 3) return;
  const t = clamp((y - top) / (bottom - top));
  const hook = n.hook * Math.sin(Math.PI * t) * 0.9;
  const sx = g.noseX + 0.9 + hook + t * (n.w * 0.45);
  // the lit bridge and the shadowed side
  if (y < bottom - 1) {
    c.tone += 0.1 * blob(x, y, g.noseX - 0.7 + hook * 0.6, (top + bottom) / 2, 1, (bottom - top) / 2);
    if (x > sx - 0.3) c.tone -= 0.17 * smooth(sx + 2.4, sx - 0.3, x) * smooth(top, top + 2, y);
  }
  // the tip, the wings and the nostrils
  c.tone += 0.1 * blob(x, y, g.noseX - 0.3, bottom - 1.6 - n.up * 0.5, 1.6, 1.3);
  for (const side of [-1, 1]) {
    const wx = g.noseX + side * n.w * 0.62;
    if (segDist(x, y, wx, bottom - 2.6, wx - side * 0.5, bottom - 0.2).d < 0.5) c.tone -= side > 0 ? 0.2 : 0.12;
    if (inEllipse(x, y, g.noseX + side * n.w * 0.32, bottom - 0.5 + n.up * 0.3, 0.9, 0.55)) c.put(1, 0.12, 'nose');
  }
  // the shadow under the nose
  c.tone -= 0.2 * blob(x, y, g.noseX + 0.6, bottom + 1, n.w * 0.9, 0.9);
}

/** The line between the lips at x: corners lifted by the curve, the right one by a grin. */
function mouthLine(g: Geometry, x: number): { y: number; s: number } {
  const m = g.mouth;
  const w = m.w * (g.child ? 0.85 : 1) * (g.x.pressed ? 0.9 : 1) * (g.spec.expression === 'shame' ? 0.8 : 1);
  const s = (x - g.mouthX) / w;
  const sc = clamp(s, -1.2, 1.2);
  const curve = g.x.curve + (g.spec.expression === 'neutral' ? m.rest : 0) + (g.old ? -0.4 : 0);
  return { y: g.mouthY - curve * sc * sc * 1.3 - g.x.smirk * Math.max(0, sc) ** 2 * 1.5, s };
}

function mouth(g: Geometry, c: Canvas, x: number, y: number): void {
  const m = g.mouth;
  const { y: ly, s } = mouthLine(g, x);
  if (Math.abs(s) > 1.15) return;
  const k = Math.max(0, 1 - s * s);
  const fem = g.female ? 0.08 : 0;
  const up = m.up * (g.x.pressed ? 0.35 : 1) + fem * 3;
  const low = m.low * (g.x.pressed ? 0.4 : 1) + fem * 3;
  const open = g.x.open * k ** 0.6;
  if (Math.abs(s) <= 1) {
    // the upper lip in shade, the lower catching light, the dent under it in shade
    if (y < ly && y > ly - up * k ** 0.5 - 0.3) c.tone -= 0.13 + fem;
    if (y > ly + open && y < ly + open + low * k ** 0.5 + 0.3) c.tone += 0.04 - fem;
    c.tone -= 0.12 * blob(x, y, g.mouthX, ly + open + low + 1.4, m.w * 0.8, 0.9);
    if (open > 0.2 && y > ly - open * 0.4 && y < ly + open) {
      // the open mouth: dark inside, teeth along the top
      const teeth = g.x.teeth && y < ly - open * 0.4 + open * 0.65 && Math.abs(s) < 0.85;
      c.put(1, teeth ? 0.88 - 0.1 * Math.abs(s) : 0.1, 'mouth');
      return;
    }
  }
  // the line between the lips, darker at the corners
  const lw = 0.5 + 0.15 * (1 - k) + (g.x.pressed ? 0.15 : 0);
  if (Math.abs(y - ly) < lw) c.put(1, 0.14 - 0.04 * (1 - k), 'mouth');
}

/** The hair seen in front of the face. */
function frontHairInside(g: Geometry, x: number, y: number): boolean {
  const hair = g.spec.hair;
  const ad = Math.abs(x - g.cx);
  const curly = hair?.variant === 2;
  const grow = curly ? 3.4 : g.female ? 3 : 2.6;
  const half = headHalf(g, y, grow) + (curly ? 0.9 * Math.cos(Math.atan2(y - g.cy, x - g.cx) * 16) : 0);
  if (ad > half || y < g.top - grow) return false;
  if (!hair) {
    // bald: a band of hair round the back of the head, over the ears
    return !g.female && !g.child && ad > headHalf(g, y) - 2.2 && y > g.eyeY - 7 && y < g.eyeY + 2.5;
  }
  const h = g.hairline;
  const r = ad / g.rx;
  const female = g.female && hair.variant !== 2 && hair.variant !== 4;
  let line: number;
  let sideDown: number;
  if (female) {
    // parted in the middle, swept to the sides over the ears
    if (ad < 0.6 && y < h - 1) return false;
    line = h - 1.5 + 2.5 * r - 2.5 * smooth(0.6, 1, r) + hair.dx * 0.5 * Math.sign(x - g.cx);
    sideDown = g.eyeY + 7;
  } else {
    switch (hair.variant) {
      case 3: {
        // parted on one side, the fringe sweeping across
        const px = g.cx - 4 + hair.dx * 1.5;
        if (Math.abs(x - px) < 0.5 && y < h - 1) return false;
        line = h + 2.2 * smooth(px, g.cx + g.rx, x) - 1.5 * smooth(0.65, 1, r);
        sideDown = g.eyeY - 3;
        break;
      }
      case 5:
        // a high forehead: the hairline recedes at the temples, a peak in the middle
        line = h - 4 * smooth(0.15, 0.6, r) + 1.2 * (1 - smooth(0, 0.18, r));
        sideDown = g.eyeY - 3;
        break;
      case 4:
        // pulled back to a queue
        line = h - 1.5;
        sideDown = g.eyeY - 4;
        break;
      case 1:
        line = h - 0.5 * r;
        sideDown = g.eyeY + 5;
        break;
      case 2:
        line = h + 0.8 * Math.cos(x * 1.1);
        sideDown = g.eyeY - 2;
        break;
      default:
        line = h + 1.4 * r * r - 1.8 * smooth(0.7, 1, r);
        sideDown = g.eyeY - 3;
    }
  }
  if (y < line) return true;
  return ad > headHalf(g, y) - (female ? 3 : 2) && y < sideDown;
}

function frontHair(g: Geometry, c: Canvas, x: number, y: number): void {
  if (!frontHairInside(g, x, y)) return;
  const lit = lambert((x - g.cx) / (g.rx + 2), (y - g.cy) / (g.ry + 2));
  c.put(1, hairTone(g, x, y, lit, g.spec.hair ?? { variant: 0, dx: 0, dy: 0 }), 'hair');
}

/** A bun on top of a woman's head. */
function bun(g: Geometry, c: Canvas, x: number, y: number): void {
  const hair = g.spec.hair;
  if (!hair || hair.variant !== 4 || !g.female) return;
  const bx = g.cx + hair.dx * 1.5;
  const by = g.top - 2;
  if (inEllipse(x, y, bx, by, 4.5, 3.2)) c.put(1, hairTone(g, x, y, lambert((x - bx) / 4.5, (y - by) / 3.2), hair) + 0.03 * Math.cos((x - bx) * 2 + y), 'hair');
}

function beard(g: Geometry, c: Canvas, x: number, y: number): void {
  const b = g.spec.beard;
  if (!b) return;
  const tone = (GREY_TONE[g.spec.grey] ?? 0.12) + 0.04;
  const ad = Math.abs(x - g.cx - b.dx * 0.8);
  const { y: ly, s } = mouthLine(g, x);
  const nearMouth = Math.abs(s) < 1.05 && y > ly - 1.2 && y < ly + g.mouth.low + 1.3 + g.x.open;
  const half = headHalf(g, y);
  const below = y > g.cy && inEllipse(x, y, g.cx, g.cy + 1, g.rx * 0.82, g.ry + 3.5);
  const onFace = ad <= half || below;
  const moustache = y > g.noseBottom + 1 && y < ly - 0.3 && ad < g.mouth.w + 1.6 + (y > ly - 1.5 ? 0.8 : 0);
  let cover: number;
  switch (b.variant) {
    case 1: {
      // a goatee under the lip and a moustache
      const goatee = y > g.mouthY + g.mouth.low + 0.8 && ad < 3.2 - (y - g.chin) * 0.4 && y < g.chin + 4;
      cover = moustache || goatee ? 1 : 0;
      break;
    }
    case 2: {
      // a moustache with drooping ends
      const ends = Math.abs(ad - (g.mouth.w + 1.8)) < 0.9 && y > ly - 1 && y < ly + 2.5;
      cover = moustache || ends ? 1 : 0;
      break;
    }
    case 3: {
      // a short beard along the jaw and on the chin
      const jaw = onFace && y > g.eyeY + 4 && half - ad < 2.6;
      const chin = onFace && y > ly + g.mouth.low + 1;
      cover = moustache || jaw || chin ? 1 : 0;
      break;
    }
    default: {
      // a full beard, its upper edge fading into the cheeks
      const edge = g.mouthY - 2.5 - 7 * smooth(0.25, 0.95, ad / g.rx);
      cover = onFace ? smooth(edge - 1.2, edge + 1.5, y) : 0;
    }
  }
  // the lips stay clear
  if (nearMouth && b.variant !== 2) cover = Math.min(cover, smooth(0, 1, Math.abs(s) - 0.8) * 0.6);
  if (cover <= 0) return;
  const lit = lambert((x - g.cx) / (g.rx + 1), (y - g.cy) / (g.ry + 3));
  c.put(cover, tone + 0.17 * lit + 0.04 * Math.cos(x * 2.1 + y * 0.6), 'beard');
}

function mole(g: Geometry, c: Canvas, x: number, y: number): void {
  if (g.spec.beauty >= 0) return;
  const mx = g.cx + 6 + g.spec.nose.dx * 1.5;
  const my = g.noseBottom + 1 + g.spec.mouth.dy;
  if (Math.hypot(x - mx, y - my) < 0.75) c.put(1, 0.12, 'mole');
}

/** A scar: a pale raised line with dark edges and stitch marks across it, in each person's own place (D-301). */
function scars(g: Geometry, c: Canvas, x: number, y: number): void {
  if (c.owner === 'background' || c.owner === 'attire') return;
  g.spec.scars.forEach((s, n) => {
    // the second scar of a person goes to the other side
    const m = n === 1 ? -1 : 1;
    const ox = g.cx + s.dx * 1.6;
    const oy = s.dy * 1.4;
    let seg: [number, number, number, number];
    switch (s.variant) {
      case 1:
        seg = [ox + m * (g.eyeSep + 0.5), g.browY - 4 + oy, ox + m * (g.eyeSep + 2), g.eyeY + 5 + oy];
        break;
      case 2:
        seg = [ox + m * 1, g.mouthY - 4.5 + oy, ox + m * 3.5, g.chin - 1 + oy];
        break;
      case 3:
        seg = [ox - m * g.rx * 0.5, g.browY - 7 + oy, ox + m * g.rx * 0.3, g.browY - 2.5 + oy];
        break;
      default:
        seg = [ox - m * g.rx * 0.78, g.eyeY + 1.5 + oy, ox - m * g.rx * 0.3, g.eyeY + g.ry * 0.45 + oy];
    }
    const { d, t } = segDist(x, y, ...seg);
    if (d > 1.8) return;
    const len = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]);
    const stitch = Math.abs(((t * len) % 2.2) - 1.1) < 0.35 && d < 1.7 && t > 0.05 && t < 0.95;
    if (stitch) c.put(1, 0.16, 'scars');
    else if (d < 0.55) c.put(1, Math.max(c.tone + 0.22, 0.8), 'scars');
    else if (d < 1.2) c.put(1, c.tone - 0.2, 'scars');
  });
}

function bandages(g: Geometry, c: Canvas, x: number, y: number): void {
  for (const b of g.spec.bandages) {
    const cloth = (fold: number) => 0.9 - 0.12 * smooth(0.55, 1, Math.cos(fold)) + 0.05 * lambert((x - g.cx) / g.rx, 0);
    switch (b.variant) {
      case 1: {
        // a plaster on the cheek: two crossed strips
        const px = g.cx + g.rx * 0.45 + b.dx * 1.3;
        const py = g.eyeY + 5 + b.dy * 1.2;
        const a = segDist(x, y, px - 3, py - 2.5, px + 3, py + 2.5);
        const e = segDist(x, y, px - 3, py + 2.5, px + 3, py - 2.5);
        const d = Math.min(a.d, e.d);
        if (d < 1.3) c.put(1, d > 0.95 ? 0.4 : cloth(a.t * 9), 'bandages');
        break;
      }
      case 2: {
        // cloth tied under the jaw and over the head
        for (const side of [-1, 1]) {
          const bx = g.cx + side * (g.rx - 1.5);
          if (Math.abs(x - bx) < 2 && y > g.top + 4 && y < g.chin - 1) c.put(1, Math.abs(x - bx) > 1.5 ? 0.45 : cloth(y * 0.9), 'bandages');
        }
        if (y > g.chin - 1 && y < g.chin + 2.5 && Math.abs(x - g.cx) < g.rx * 0.8) c.put(1, y > g.chin + 2 ? 0.45 : cloth(x * 0.8), 'bandages');
        if (inEllipse(x, y, g.cx - 1.5 + b.dx, g.top - 0.5, 1.6, 1.4) || inEllipse(x, y, g.cx + 1.5 + b.dx, g.top - 0.5, 1.6, 1.4)) c.put(1, cloth(x), 'bandages');
        break;
      }
      default: {
        // a band round the head with a knot on one side
        const y0 = g.browY - 6.8 + b.dy;
        if (y > y0 && y < y0 + 4 && Math.abs(x - g.cx) <= headHalf(g, y, 0.8)) c.put(1, y < y0 + 0.5 || y > y0 + 3.5 ? 0.42 : cloth((x + y * 1.5) * 0.7), 'bandages');
        const kx = g.cx + g.rx + 1 + b.dx;
        if (inEllipse(x, y, kx, y0 + 1, 1.8, 1.4) || segDist(x, y, kx, y0 + 2, kx + 2, y0 + 6).d < 0.8) c.put(1, cloth(y * 1.3) - 0.05, 'bandages');
      }
    }
  }
}

function eyepatch(g: Geometry, c: Canvas, x: number, y: number): void {
  const side = g.spec.eyepatch === 'left' ? -1 : g.spec.eyepatch === 'right' ? 1 : 0;
  if (!side) return;
  const px = g.cx + side * g.eyeSep;
  const py = g.eyeY - 0.3;
  if (inEllipse(x, y, px, py, g.eye.w + 1.2, g.eye.h + 2)) {
    c.put(1, 0.1 + 0.18 * blob(x, y, px - 1.2, py - 1.2, 1.8, 1.4), 'eyepatch');
    return;
  }
  // the strap: to the near temple and across the forehead to the far side
  const near = segDist(x, y, px + side * g.eye.w, py - 0.5, g.cx + side * (g.rx + 0.5), py - 1.5);
  const far = segDist(x, y, px - side * (g.eye.w - 0.5), py - 1.5, g.cx - side * (g.rx - 0.5), g.top + 6);
  if (Math.min(near.d, far.d) < 0.55) c.put(1, 0.14, 'eyepatch');
}

function headwear(g: Geometry, c: Canvas, x: number, y: number, a: Part): void {
  const cx = g.cx + a.dx * 1.2;
  const top = g.top + a.dy + (g.female ? 0 : 2.5);
  const ad = Math.abs(x - cx);
  const lit = clamp(0.6 - (x - cx) / 40 - 0.2 * smooth(top - 6, top + 4, y));
  if (g.female) {
    switch (a.variant) {
      case 1: {
        // a hood framing the face
        const outer = inEllipse(x, y, g.cx, g.cy - 1, g.rx + 4.5, g.ry + 4.5) && y < g.chin - 2;
        const face = inEllipse(x, y, g.cx, g.cy + 2, g.rx - 1, g.ry - 1) && y > g.hairline - 1;
        if (outer && !face) {
          const folds = 0.1 * smooth(0.6, 1, Math.cos(Math.atan2(y - g.cy, x - g.cx) * 9));
          const rim = 0.15 * smooth(g.rx + 2.5, g.rx + 4.5, Math.hypot(x - g.cx, (y - g.cy) * 0.8));
          const inner = 0.22 * smooth(g.rx + 0.5, g.rx - 1, Math.hypot(x - g.cx, (y - g.cy - 2) * (g.rx / g.ry)));
          c.put(1, 0.62 + 0.25 * lit - folds - rim - inner, 'headwear');
        }
        return;
      }
      case 2: {
        // a broad hat with a ribbon
        const brim = inEllipse(x, y, cx, top + 2, g.rx + 8, 2.4);
        const crown = ad < g.rx * 0.65 && y > top - 6 && y < top + 2;
        if (crown) c.put(1, (y > top - 1 && y < top + 1.2 ? 0.86 : 0.3) + 0.15 * lit, 'headwear');
        if (brim && !(crown && y < top + 1.2)) c.put(1, 0.25 + 0.2 * lit + 0.1 * smooth(top + 1.5, top + 3, y), 'headwear');
        return;
      }
      default: {
        // a linen cap with a frilled edge
        if (inEllipse(x, y, cx, g.cy - 1, g.rx + 2.2, g.ry + 2.2) && y < g.hairline + 0.5 + 0.8 * Math.cos(x * 1.8)) {
          c.put(1, 0.84 + 0.12 * lit - 0.08 * smooth(0.5, 1, Math.cos(x * 1.8)), 'headwear');
        }
        return;
      }
    }
  }
  switch (a.variant) {
    case 1: {
      // a soft cap tipped to one side, with a band
      if (inEllipse(x, y, cx - 1.5, top + 1, g.rx + 2.5, 5.5) && y < top + 3.5) c.put(1, (y > top + 2 ? 0.18 : 0.3) + 0.25 * lit, 'headwear');
      return;
    }
    case 2: {
      // a fur cap
      const capHalf = g.rx + 1.5;
      if (ad < capHalf && y > top - 6 && y < top + 4 && (y > top - 4 || ad < capHalf - 2)) {
        c.put(1, 0.5 + 0.25 * lit + 0.12 * Math.cos(x * 2.2 + Math.sin(y * 1.7) * 2) * Math.cos(y * 1.9), 'headwear');
      }
      return;
    }
    default: {
      // a tricorn seen from the front: peaks at the sides, the brim dips to a point over the brow, braid on its edge
      const hw = g.rx + 5.5;
      if (ad > hw) return;
      const r = ad / hw;
      const bottom = top + 4 - 6.5 * r ** 1.4;
      const crown = top - 6.5 + 1.2 * r * r - 2.2 * smooth(0.78, 1, r);
      if (y < crown || y > bottom) return;
      const braid = y > bottom - 1.1 && r < 0.92;
      c.put(1, braid ? 0.82 : 0.12 + 0.2 * lit + 0.05 * smooth(bottom - 3, bottom - 1, y), 'headwear');
    }
  }
}

function jewel(g: Geometry, c: Canvas, x: number, y: number, a: Part): void {
  if (g.female) {
    for (const side of [-1, 1]) {
      const ey = earY(g);
      const jx = g.cx + side * (headHalf(g, ey) + g.ear.out * 0.3) + side * a.dx * 0.3;
      const jy = ey + g.ear.h / 2 + 0.6 + a.dy * 0.4;
      if (a.variant === 0) {
        // a pearl drop
        if (Math.hypot(x - jx, y - jy - 2) < 1.1) c.put(1, Math.hypot(x - jx + 0.4, y - jy - 1.6) < 0.5 ? 1 : 0.7, 'jewel');
        if (Math.abs(x - jx) < 0.3 && y > jy - 0.5 && y < jy + 1) c.put(1, 0.3, 'jewel');
      } else if (a.variant === 1) {
        if (Math.hypot(x - jx, y - jy) < 0.8) c.put(1, 0.95, 'jewel');
      } else if (Math.abs(Math.hypot(x - jx, y - jy - 1.4) - 1.4) < 0.4) {
        c.put(1, 0.85, 'jewel');
      }
    }
    return;
  }
  // a man wears his jewel as a pin or an order on the chest
  const jx = g.cx + 10 + a.dx;
  const jy = g.shoulders + 7 + a.dy;
  const r = Math.hypot(x - jx, y - jy);
  if (a.variant === 0 && r < 1.8) c.put(1, r < 0.8 ? 0.3 : 0.88, 'jewel');
  if (a.variant === 1 && r < Math.abs(Math.cos(Math.atan2(y - jy, x - jx) * 4)) * 1.2 + 0.9) c.put(1, r < 0.7 ? 1 : 0.8, 'jewel');
  if (a.variant === 2 && Math.abs(x - jx) < 0.8 && y > jy - 2.5 && y < jy + 2.5) c.put(1, Math.abs(y - jy) < 0.6 ? 1 : 0.75, 'jewel');
}

function sample(g: Geometry, x: number, y: number): Canvas {
  const c = new Canvas();
  background(c, x, y);
  body(g, c, x, y);
  backHair(g, c, x, y);
  neck(g, c, x, y);
  ears(g, c, x, y);
  skin(g, c, x, y);
  if (c.owner === 'head') {
    wrinkles(g, c, x, y);
    nose(g, c, x, y);
    mouth(g, c, x, y);
    eyes(g, c, x, y);
    brows(g, c, x, y);
    mole(g, c, x, y);
  }
  frontHair(g, c, x, y);
  bun(g, c, x, y);
  beard(g, c, x, y);
  scars(g, c, x, y);
  bandages(g, c, x, y);
  eyepatch(g, c, x, y);
  const hat = g.spec.accessories.find((a) => a.slot === 'head');
  if (hat) headwear(g, c, x, y, hat);
  const jewelPart = g.spec.accessories.find((a) => a.slot === 'ear');
  if (jewelPart) jewel(g, c, x, y, jewelPart);
  return c;
}

const SUB = [1 / 6, 1 / 2, 5 / 6];
/** Details that make the outline of the figure: a darker rim where they meet the background. */
const FIGURE = new Set(['head', 'hair', 'attire', 'neck', 'ears', 'headwear', 'beard', 'bandages']);

export function portraitGrid(spec: FaceSpec): Grid {
  const g = geometry(spec);
  const width = PORTRAIT_WIDTH;
  const height = PORTRAIT_HEIGHT;
  const tones: number[] = [];
  const owner: string[] = [];
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let sum = 0;
      let middle = 'background';
      for (const sy of SUB) {
        for (const sx of SUB) {
          const c = sample(g, px + sx, py + sy);
          sum += c.tone;
          if (sx === 0.5 && sy === 0.5) middle = c.owner;
        }
      }
      tones.push(sum / 9);
      owner.push(middle);
    }
  }
  // a rim of shade round the figure keeps it clear against the background
  const background = (j: number) => owner[j] === 'background';
  const shades = tones.map((tone, i) => {
    let t = tone;
    const x = i % width;
    t = clamp((t - 0.5) * 1.2 + 0.52);
    if (!FIGURE.has(owner[i]!)) return shadeOf(t);
    const rim = (x > 0 && background(i - 1)) || (x < width - 1 && background(i + 1)) || (i >= width && background(i - width)) || (i + width < tones.length && background(i + width));
    return shadeOf(rim ? t - 0.18 : t);
  });
  return { width, height, shades: shades.map((s) => Math.min(SHADES - 1, s)), owner };
}
