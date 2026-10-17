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
  joy: X({ curve: 1.5, open: 0.7, teeth: true, eyes: 0.8, lowerLid: 0.5, brows: -0.3, cheeks: 1 }),
  triumph: X({ curve: 0.4, smirk: 1.6, eyes: 0.85, lowerLid: 0.3, brows: 0.4, cheeks: 0.5 }),
  threat: X({ curve: -0.2, pressed: true, eyes: 0.65, lowerLid: 0.25, brows: 1.3 }),
  pain: X({ curve: -1, open: 1.2, teeth: true, eyes: 0.25, lowerLid: 0.5, brows: -1.3, cheeks: 0.6 }),
  loss: X({ curve: -1.2, eyes: 0.75, gaze: 0.5, brows: -1.5, tears: true }),
  shame: X({ curve: -0.5, pressed: true, eyes: 0.5, gaze: 1.3, brows: -0.8 }),
  anger: X({ curve: -0.8, open: 0.9, teeth: true, eyes: 0.7, lowerLid: 0.3, brows: 1.9 }),
  dead: X({ curve: -0.3, open: 0.4, eyes: 0, brows: 0 }),
};

/**
 * Head shapes below the cheekbones: `p` squares the jaw (2 a soft oval, 4 a square jaw), `q` narrows it toward the
 * chin; `chin` is the chin's width as a part of the head's, `long` extra length.
 */
const HEADS = [
  { p: 2.3, q: 0.06, chin: 0.34, long: 0 },
  { p: 2.6, q: 0, chin: 0.42, long: -0.8 },
  { p: 3.6, q: 0.02, chin: 0.5, long: 0 },
  { p: 1.9, q: 0.12, chin: 0.3, long: 1.2 },
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
  { w: 4.5, up: 0.6, low: 0.9, rest: 0.15 },
  { w: 3.7, up: 1.2, low: 1.6, rest: 0 },
  { w: 4.2, up: 0.7, low: 1.0, rest: 0.45 },
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
  // a woman's jaw is softer, her chin rounder
  const head = female ? { ...shape, p: Math.min(shape.p, 2.2), q: shape.q + 0.04 } : shape;
  // a narrow head, taller than wide; a child's is rounder
  const rx = (child ? 12.6 : female ? 13.4 : 14.6) + spec.headWidth * 0.9;
  const ry = (child ? 15 : female ? 17.6 : 18.6) + spec.headHeight * 0.9 + head.long;
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
    neckHalf: child ? 4.6 : female ? 4.6 : 6,
    shoulders: chin + (child ? 3 : female ? 4.5 : 3.5),
    shoulderHalf,
    slope: female ? 0.36 : child ? 0.3 : 0.28,
  };
}

/** Half width of the head at height y (negative outside): a rounded skull, cheekbones, a jaw and a chin. */
export function headHalf(g: Geometry, y: number, grow = 0): number {
  const rx = g.rx + grow;
  const top = g.top - grow;
  const chin = g.chin + grow * 0.6;
  if (y < top || y > chin) return -1;
  // the skull: an ellipse down to the cheekbones
  const cheek = g.eyeY + 1.5;
  if (y <= cheek) {
    const t = (cheek - y) / (cheek - top);
    return rx * Math.sqrt(Math.max(0, 1 - t ** 2.2)) * (1 - 0.04 * gauss(0, t, 0, 0.45, 1, 0.2));
  }
  // one smooth curve from the cheekbones down the jaw to the chin
  const u = (y - cheek) / (chin - cheek);
  const jowls = g.old && !g.female ? 0.5 * gauss(0, u, 0, 0.6, 1, 0.2) : 0;
  return rx * Math.sqrt(Math.max(0, 1 - u ** g.head.p)) * (1 - g.head.q * u * u) + jowls;
}
