import type { FaceSpec } from '../../core/looks';

/**
 * Where the parts of a face lie (4.12, D-305), in design units of a 64×80 frame. One middle line, classical
 * proportions: hairline to brows, brows to the base of the nose, nose to chin are near thirds; the mouth sits a third
 * of the way from the nose to the chin; the eyes are an eye's width apart. The genes (variants and shifts of
 * `FaceSpec`) change the measures of each part — wider cheekbones, a longer nose, heavier lids — symmetrically, so a
 * face stays whole and every face is its own.
 */

/** How a mood moves the face (D-177): kept small, as faces move in life. */
export interface Mood {
  /** Mouth corners up (+) or down (−), in design units; one corner up; lips apart on the teeth; lips pressed. */
  curve: number;
  smirk: number;
  teeth: boolean;
  pressed: boolean;
  slack: boolean;
  /** Openness of the eyes (1 open, 0 shut), the look down (+), lower lids raised. */
  open: number;
  gaze: number;
  lower: number;
  /** Inner ends of the brows: + down (anger), − up (grief). */
  brows: number;
  tears: boolean;
}

const M = (m: Partial<Mood>): Mood => ({ curve: 0, smirk: 0, teeth: false, pressed: false, slack: false, open: 1, gaze: 0, lower: 0, brows: 0, tears: false, ...m });

export const MOODS: Record<string, Mood> = {
  neutral: M({}),
  joy: M({ curve: 0.7, open: 0.8, lower: 0.35 }),
  triumph: M({ curve: 0.2, smirk: 0.8, open: 0.9, brows: 0.3 }),
  threat: M({ pressed: true, open: 0.7, lower: 0.2, brows: 0.8 }),
  pain: M({ curve: -0.6, teeth: true, open: 0.35, lower: 0.4, brows: -0.9 }),
  loss: M({ curve: -0.7, open: 0.75, gaze: 0.6, brows: -1, tears: true }),
  shame: M({ curve: -0.3, pressed: true, open: 0.6, gaze: 1, brows: -0.6 }),
  anger: M({ curve: -0.5, teeth: true, open: 0.8, lower: 0.2, brows: 1.2 }),
  dead: M({ slack: true, open: 0 }),
};

/** Head shapes: cheekbones, the jaw at its angle, the chin, as parts of the half width; extra length. */
const HEADS = [
  { cheek: 1, jaw: 0.8, chin: 0.31, long: 0 },
  { cheek: 1.03, jaw: 0.87, chin: 0.36, long: -1 },
  { cheek: 1, jaw: 0.92, chin: 0.42, long: 0 },
  { cheek: 0.96, jaw: 0.72, chin: 0.26, long: 1.6 },
];
/** Eyes: half width, half height of the opening, droop of the outer corner (+ down), heavy lid, iris radius. */
const EYES = [
  { w: 3.1, h: 1.45, droop: 0.1, lid: 0.25, iris: 1.05 },
  { w: 3.2, h: 1.25, droop: 0.3, lid: 0.6, iris: 1.05 },
  { w: 2.9, h: 1.7, droop: 0, lid: 0.1, iris: 1.15 },
  { w: 3.3, h: 1.5, droop: 0.45, lid: 0.35, iris: 1.1 },
  { w: 3.0, h: 1.3, droop: -0.1, lid: 0.45, iris: 1 },
];
/** Brows: thickness at the inner end, arch, outer end lower (+), length. */
const BROWS = [
  { th: 1.1, arch: 0.7, slope: 0.3, len: 1 },
  { th: 0.8, arch: 1.3, slope: 0.6, len: 1.05 },
  { th: 1.6, arch: 0.35, slope: 0.1, len: 1.1 },
  { th: 1.2, arch: 0.6, slope: 1, len: 0.95 },
];
/** Noses: half width of the wings, hook of the bridge, length change, tip turned up. */
const NOSES = [
  { w: 2.4, hook: 0, len: 0, up: 0 },
  { w: 2.4, hook: 1, len: 0.7, up: -0.3 },
  { w: 3.1, hook: 0.2, len: 0, up: 0 },
  { w: 2.1, hook: -0.4, len: -1, up: 0.6 },
  { w: 2, hook: 0.5, len: 1.4, up: -0.2 },
];
/** Mouths: half width, the upper and the lower lip. */
const MOUTHS = [
  { w: 3.9, up: 0.85, low: 1.1 },
  { w: 4.6, up: 0.6, low: 0.85 },
  { w: 3.8, up: 1.1, low: 1.5 },
  { w: 4.4, up: 0.7, low: 1.2 },
];

export interface Anatomy {
  spec: FaceSpec;
  mood: Mood;
  female: boolean;
  child: boolean;
  old: boolean;
  /** Lean, deep shadows under the bones: the old, the gravely ill, the dead. */
  gaunt: boolean;
  cx: number;
  top: number;
  chin: number;
  hw: number;
  cheek: number;
  jaw: number;
  chinW: number;
  /** Height of the cheekbones' crest. */
  cheekY: number;
  hairline: number;
  browY: number;
  eyeY: number;
  eyeOff: number;
  eye: (typeof EYES)[number];
  brow: (typeof BROWS)[number];
  noseBottom: number;
  nose: (typeof NOSES)[number];
  mouthY: number;
  mouth: (typeof MOUTHS)[number];
  earY: number;
  neckHalf: number;
  shoulders: number;
  shoulderHalf: number;
  /** How far the shoulders fall from the neck to their edge. */
  fall: number;
}

export function anatomy(spec: FaceSpec): Anatomy {
  const child = spec.stage === 'child';
  const female = spec.sex === 'female';
  const old = spec.stage === 'old';
  const shape = HEADS[female && spec.head.variant === 2 ? 0 : spec.head.variant] ?? HEADS[0]!;
  const head = female ? { ...shape, jaw: shape.jaw - 0.07, chin: shape.chin - 0.05 } : child ? { ...shape, jaw: 0.76, chin: 0.3, long: 0 } : shape;
  const hw = (child ? 14.6 : female ? 14.4 : 15.6) + spec.headWidth * 0.8;
  const top = (child ? 14 : female ? 10.5 : 9.5) - spec.headHeight * 0.6;
  const chin = (child ? 51.5 : female ? 55.4 : 56.6) + spec.headHeight * 0.8 + head.long;
  // thirds: the skull above the hairline, then hairline → brows → base of the nose → chin; a child's lower face is short
  const hairline = top + (chin - top) * (child ? 0.26 : 0.2);
  const third = (chin - hairline) / 3;
  const browY = hairline + third * (child ? 1.05 : 1) + spec.brows.dy * 0.4;
  const eyeY = browY + (child ? 3 : 2.8) + spec.eyes.dy * 0.4;
  const nose = NOSES[child ? 3 : spec.nose.variant] ?? NOSES[0]!;
  const noseBottom = hairline + third * (child ? 1.75 : 2) + (child ? 0 : nose.len) + spec.nose.dy * 0.4;
  // the mouth a third of the way from the nose to the chin
  const mouthY = noseBottom + (chin - noseBottom) * (0.3 + spec.mouth.dy * 0.03);
  const eyeBase = EYES[spec.eyes.variant] ?? EYES[0]!;
  const big = child ? 1.08 : 1;
  const mouth = MOUTHS[spec.mouth.variant] ?? MOUTHS[0]!;
  return {
    spec,
    mood: MOODS[spec.expression] ?? MOODS.neutral!,
    female,
    child,
    old,
    gaunt: old || spec.illness > 1 || spec.dead,
    cx: 32,
    top,
    chin,
    hw,
    cheek: hw * head.cheek,
    jaw: hw * head.jaw,
    chinW: hw * head.chin,
    cheekY: eyeY + 3.2 + spec.head.dx * 0.6,
    hairline: hairline + (spec.hair?.dy ?? 0) * 0.6,
    browY,
    eyeY,
    eyeOff: (child ? 6.2 : 6.7) + spec.eyes.dx * 0.45,
    eye: { ...eyeBase, w: eyeBase.w * big, h: eyeBase.h * big + (spec.beauty > 0 ? 0.1 : 0), iris: eyeBase.iris * big },
    brow: BROWS[spec.brows.variant] ?? BROWS[0]!,
    noseBottom,
    nose: { ...nose, w: nose.w * (female || child ? 0.85 : 1) + spec.nose.dx * 0.25 + (spec.beauty < 0 ? 0.35 : 0) },
    mouthY,
    mouth: { ...mouth, w: mouth.w * (child ? 0.8 : female ? 0.9 : 1) + spec.mouth.dx * 0.35, up: mouth.up + (female ? 0.2 : 0), low: mouth.low + (female ? 0.25 : 0) },
    earY: (browY + noseBottom) / 2 + 0.5 + spec.ears.dy * 0.4,
    neckHalf: child ? 4.6 : female ? 4.6 : 6.2,
    shoulders: chin + (child ? 5 : female ? 7 : 6),
    shoulderHalf: child ? 21 : female ? 24 : 31,
    fall: child ? 8 : female ? 10 : 7.5,
  };
}
