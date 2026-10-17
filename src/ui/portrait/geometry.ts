import type { FaceSpec } from '../../core/looks';
import { gauss } from './shape';

/**
 * Where the parts of the face lie (4.12, D-305). The face is built on classical proportions: from the hairline to the
 * brows, from the brows to the base of the nose and from there to the chin are equal thirds; the eyes sit just under
 * the brows, one eye's width apart. Every part hangs on one middle line, so the parts never drift apart: the genes
 * (variants and shifts of `FaceSpec`) change proportions symmetrically, never move one part off the axis.
 */

/** How a mood moves the face (D-177). */
export interface Expression {
  /** Lift of the mouth corners (+ smile, − frown). */
  curve: number;
  /** Lift of one corner only: a one-sided grin. */
  smirk: number;
  /** How far the lips part, in pixels; teeth may show. */
  open: number;
  teeth: boolean;
  /** Lips pressed thin. */
  pressed: boolean;
  /** Openness of the eyes, 0 closed .. 1. */
  eyes: number;
  /** Lower lids pushed up by a smile or a wince. */
  lowerLid: number;
  /** Look down (+). */
  gaze: number;
  /** Inner ends of the brows: + down (anger), − up (grief). */
  brows: number;
  /** Cheeks raised by a smile. */
  cheeks: number;
  tears: boolean;
}

const X = (e: Partial<Expression>): Expression => ({ curve: 0, smirk: 0, open: 0, teeth: false, pressed: false, eyes: 1, lowerLid: 0, gaze: 0, brows: 0, cheeks: 0, tears: false, ...e });

export const EXPRESSIONS: Record<string, Expression> = {
  neutral: X({}),
  joy: X({ curve: 0.85, open: 0.3, teeth: true, eyes: 0.85, lowerLid: 0.35, brows: -0.15, cheeks: 0.6 }),
  triumph: X({ curve: 0.25, smirk: 0.9, eyes: 0.85, lowerLid: 0.25, brows: 0.3, cheeks: 0.3 }),
  threat: X({ curve: -0.2, pressed: true, eyes: 0.65, lowerLid: 0.25, brows: 1.3 }),
  pain: X({ curve: -0.6, open: 0.7, teeth: true, eyes: 0.35, lowerLid: 0.4, brows: -1, cheeks: 0.4 }),
  loss: X({ curve: -0.8, eyes: 0.8, gaze: 0.5, brows: -1.2, tears: true }),
  shame: X({ curve: -0.35, pressed: true, eyes: 0.55, gaze: 1.2, brows: -0.6 }),
  anger: X({ curve: -0.5, open: 0.5, teeth: true, eyes: 0.75, lowerLid: 0.25, brows: 1.5 }),
  dead: X({ curve: -0.3, open: 0.4, eyes: 0, brows: 0 }),
};

/**
 * Head shapes: width of the jaw at its angle and of the chin as parts of the head's width, width of the cheekbones,
 * extra length. A man's jaw and chin are wider and flatter; a woman's narrower and rounder.
 */
const HEADS = [
  { jaw: 0.82, chin: 0.36, cheek: 1, long: 0 },
  { jaw: 0.9, chin: 0.44, cheek: 1.03, long: -0.6 },
  { jaw: 0.94, chin: 0.5, cheek: 1, long: 0 },
  { jaw: 0.76, chin: 0.32, cheek: 0.98, long: 1.2 },
];
/** Eyes: half width, half height of the opening, droop of the outer corner (+ down), heavy upper lid. */
const EYES = [
  { w: 2.9, h: 1.35, droop: 0, lid: 0.15 },
  { w: 3.0, h: 1.35, droop: 0.35, lid: 0.35 },
  { w: 2.7, h: 1.6, droop: 0, lid: 0 },
  { w: 3.1, h: 1.45, droop: 0.4, lid: 0.25 },
  { w: 2.8, h: 1.35, droop: 0.1, lid: 0.25 },
];
/** Brows: thickness, arch, outer end lower (+). */
const BROWS = [
  { th: 1.3, arch: 0.7, slope: 0.2 },
  { th: 1.0, arch: 1.5, slope: 0.5 },
  { th: 2.0, arch: 0.35, slope: 0.1 },
  { th: 1.5, arch: 0.9, slope: 1.0 },
];
/** Nose: width of the wings, hook of the bridge, height off the face, length change. */
const NOSES = [
  { w: 2.4, hook: 0, proj: 4.2, len: 0 },
  { w: 2.5, hook: 1.4, proj: 5.2, len: 0.6 },
  { w: 3.2, hook: 0.2, proj: 4.2, len: -0.3 },
  { w: 2.2, hook: -0.6, proj: 3.4, len: -0.8 },
  { w: 2.2, hook: 0.5, proj: 5, len: 1.2 },
];
/** Mouth: half width, fullness of the upper and lower lip, corners at rest (+ down). */
const MOUTHS = [
  { w: 3.9, up: 0.9, low: 1.2, rest: 0 },
  { w: 4.5, up: 0.6, low: 0.9, rest: 0 },
  { w: 3.7, up: 1.2, low: 1.6, rest: 0 },
  { w: 4.2, up: 0.7, low: 1.0, rest: 0.2 },
];
/** Ears: height, how far they stand out. */
const EARS = [
  { h: 5.6, out: 1.2 },
  { h: 6.8, out: 1.4 },
  { h: 6, out: 2 },
];

export interface Geometry {
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
  head: (typeof HEADS)[number];
  hairline: number;
  browY: number;
  eyeY: number;
  eyeSep: number;
  eye: (typeof EYES)[number] & { iris: number };
  brow: (typeof BROWS)[number];
  noseBottom: number;
  nose: (typeof NOSES)[number];
  mouthY: number;
  mouth: (typeof MOUTHS)[number];
  ear: (typeof EARS)[number];
  earY: number;
  neckHalf: number;
  shoulders: number;
  /** Half width of the shoulders. */
  shoulderHalf: number;
  /** How much the shoulders fall from the neck. */
  slope: number;
}

export function geometry(spec: FaceSpec): Geometry {
  const child = spec.stage === 'child';
  const female = spec.sex === 'female';
  const old = spec.stage === 'old';
  const shape = HEADS[female && spec.head.variant === 2 ? 0 : spec.head.variant] ?? HEADS[0]!;
  // a woman's jaw is narrower, her chin smaller and rounder; a child's face is soft
  const head = female ? { ...shape, jaw: shape.jaw - 0.07, chin: shape.chin - 0.06 } : child ? { ...shape, jaw: 0.86, chin: 0.42 } : shape;
  // a narrow head, taller than wide; a child's is rounder
  const rx = (child ? 12.4 : female ? 12.5 : 13.5) + spec.headWidth * 0.8;
  const ry = (child ? 15.4 : female ? 18.4 : 19.6) + spec.headHeight * 0.9 + head.long;
  const cx = 32;
  const cy = (child ? 41 : 35) + spec.head.dy * 0.6;
  const top = cy - ry;
  const chin = cy + ry;
  // thirds: skull above the hairline, then hairline → brows → base of the nose → chin
  const third = (chin - top) / (child ? 3.1 : 3.4);
  const hairline = chin - 3 * third + (child ? 1.5 : 0);
  const browY = hairline + third + spec.brows.dy * 0.5 + (child ? 1.2 : 0);
  const noseBottom = browY + third * (child ? 0.82 : 1) + (NOSES[spec.nose.variant]?.len ?? 0) * (child ? 0.3 : 1) + spec.nose.dy * 0.5;
  const eyeBase = EYES[spec.eyes.variant] ?? EYES[0]!;
  const big = child ? 1.12 : 1;
  const eye = { ...eyeBase, w: eyeBase.w * big, h: eyeBase.h * big * 1.35 + (spec.beauty > 0 ? 0.12 : 0), iris: 1.45 * big };
  const mouth = MOUTHS[spec.mouth.variant] ?? MOUTHS[0]!;
  const nose = NOSES[child ? 3 : spec.nose.variant] ?? NOSES[0]!;
  const shoulderHalf = child ? 17 : female ? 19.5 : 25;
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
    top,
    chin,
    head,
    hairline: hairline + (spec.hair?.dy ?? 0) * 0.7,
    browY,
    eyeY: browY + (child ? 2.6 : 2.7) + spec.eyes.dy * 0.4,
    // an eye's width apart, a little more or less by the genes
    eyeSep: eye.w * 2 + 0.2 + spec.eyes.dx * 0.35,
    eye,
    brow: BROWS[spec.brows.variant] ?? BROWS[0]!,
    noseBottom,
    nose: { ...nose, w: nose.w * (child || female ? 0.85 : 1) + spec.nose.dx * 0.25 + (spec.beauty < 0 ? 0.3 : 0), proj: nose.proj * (child ? 0.55 : female ? 0.62 : 0.82), hook: nose.hook * (female ? 0.5 : 1) },
    mouthY: noseBottom + (chin - noseBottom) * (child ? 0.36 : 0.34) + spec.mouth.dy * 0.4 + (old ? 0.4 : 0),
    mouth: { ...mouth, w: mouth.w * (child ? 0.82 : female ? 0.92 : 1) + spec.mouth.dx * 0.3 },
    ear: EARS[spec.ears.variant] ?? EARS[0]!,
    earY: (browY + noseBottom) / 2 + 0.5 + spec.ears.dy * 0.4,
    neckHalf: child ? 4.8 : female ? 5 : 6.8,
    shoulders: chin + (child ? 3 : female ? 4.5 : 3.5),
    shoulderHalf,
    slope: female ? 0.36 : child ? 0.3 : 0.28,
  };
}

/** Half width of the head at height y (negative outside): crown, temples, cheekbones, cheeks, the angle of the jaw, chin. */
export function headHalf(g: Geometry, y: number, grow = 0): number {
  const top = g.top - grow;
  const chin = g.chin + grow * 0.5;
  if (y < top || y > chin) return -1;
  const h = g.chin - g.top;
  const { jaw, chin: chinW, cheek } = g.head;
  const round = g.female || g.child ? 0.45 : 0.75;
  // the outline through points, each a height and a width as part of the head's half width
  const points: [number, number][] = [
    [g.top, 0],
    [g.top + 0.07 * h, 0.6],
    [g.top + 0.2 * h, 0.88],
    [g.browY - 2.5, 0.97],
    [g.browY + 0.8, 0.95],
    [g.eyeY + 2, cheek],
    [g.mouthY - 2.2, (cheek + jaw) / 2 + 0.02],
    [g.mouthY + 1.5, jaw],
    [g.chin - 2.4, chinW + 0.14],
    [g.chin - 0.7, chinW],
    [g.chin, chinW * round],
  ];
  // a grown outline (for hair) is the same shape, scaled
  const yy = g.top + ((y - top) * h) / (chin - top);
  let w = 0;
  for (let i = 1; i < points.length; i++) {
    const [y1, w1] = points[i]!;
    if (yy > y1 && i < points.length - 1) continue;
    const [y0, w0] = points[i - 1]!;
    const s = y1 > y0 ? Math.min(1, Math.max(0, (yy - y0) / (y1 - y0))) : 1;
    w = w0 + (w1 - w0) * (1 - Math.cos(Math.PI * s)) / 2;
    break;
  }
  const jowls = g.old && !g.female ? 0.05 * gauss(0, y, 0, g.mouthY + 1, 1, 2.5) : 0;
  return (g.rx + grow) * (w + jowls);
}
