import type { FaceSpec } from '../../core/looks';

/**
 * Where the parts of a face lie (4.12, D-305). One middle line, classical proportions; the genes (variants and shifts
 * of `FaceSpec`) move the corners of the drawn planes — the width of the cheekbones and the jaw, the length of the
 * nose, the set of the eyes — symmetrically, so the parts stay one face.
 */

/** How a mood moves the face (D-177): kept small, as faces move in life. */
export interface Mood {
  /** Mouth: corners up (+) or down (−) in pixels; one corner up; lips parted with teeth; pressed thin. */
  curve: number;
  smirk: number;
  teeth: boolean;
  pressed: boolean;
  slack: boolean;
  /** Eyes: open, narrowed, closed, cast down. */
  eyes: 'open' | 'narrow' | 'closed' | 'down' | 'wince';
  /** Inner ends of the brows: + down (anger), − up (grief). */
  brows: number;
  tears: boolean;
}

const M = (m: Partial<Mood>): Mood => ({ curve: 0, smirk: 0, teeth: false, pressed: false, slack: false, eyes: 'open', brows: 0, tears: false, ...m });

export const MOODS: Record<string, Mood> = {
  neutral: M({}),
  joy: M({ curve: 1, eyes: 'narrow' }),
  triumph: M({ smirk: 1, brows: 0.5 }),
  threat: M({ pressed: true, eyes: 'narrow', brows: 1 }),
  pain: M({ curve: -1, teeth: true, eyes: 'wince', brows: -1 }),
  loss: M({ curve: -1, eyes: 'down', brows: -1, tears: true }),
  shame: M({ pressed: true, eyes: 'down', brows: -1 }),
  anger: M({ curve: -1, teeth: true, eyes: 'narrow', brows: 1 }),
  dead: M({ slack: true, eyes: 'closed' }),
};

/** Head shapes: width of the cheekbones, the jaw at its angle and the chin as parts of the half width; extra length. */
const HEADS = [
  { cheek: 1, jaw: 0.68, chin: 0.2, long: 0 },
  { cheek: 1.03, jaw: 0.78, chin: 0.27, long: -1 },
  { cheek: 1, jaw: 0.84, chin: 0.33, long: 0 },
  { cheek: 0.97, jaw: 0.6, chin: 0.17, long: 1.6 },
];
/** Noses: width of the wings, a hook on the bridge, length change, tip turned up. */
const NOSES = [
  { w: 2.6, hook: 0, len: 0, up: false },
  { w: 2.6, hook: 1, len: 0.6, up: false },
  { w: 3.4, hook: 0, len: 0, up: false },
  { w: 2.3, hook: 0, len: -1, up: true },
  { w: 2.2, hook: 0.5, len: 1.4, up: false },
];
/** Mouths: half width, a fuller lower lip. */
const MOUTHS = [
  { w: 4, full: false },
  { w: 5, full: false },
  { w: 4, full: true },
  { w: 5, full: true },
];

export interface Anatomy {
  spec: FaceSpec;
  mood: Mood;
  female: boolean;
  child: boolean;
  old: boolean;
  cx: number;
  top: number;
  chin: number;
  /** Half width at the temples; the cheekbones, jaw and chin as half widths in pixels. */
  hw: number;
  cheek: number;
  jaw: number;
  chinW: number;
  browY: number;
  eyeY: number;
  /** Distance from the middle line to the middle of each eye. */
  eyeOff: number;
  noseBottom: number;
  nose: (typeof NOSES)[number];
  mouthY: number;
  mouth: (typeof MOUTHS)[number];
  earY: number;
  hairline: number;
  neckHalf: number;
  shoulders: number;
  shoulderHalf: number;
}

export function anatomy(spec: FaceSpec): Anatomy {
  const child = spec.stage === 'child';
  const female = spec.sex === 'female';
  const old = spec.stage === 'old';
  const shape = HEADS[female && spec.head.variant === 2 ? 0 : spec.head.variant] ?? HEADS[0]!;
  const head = female ? { ...shape, jaw: shape.jaw - 0.06, chin: shape.chin - 0.04 } : child ? { ...shape, jaw: 0.74, chin: 0.26 } : shape;
  const hw = (child ? 15.2 : female ? 14.8 : 16) + spec.headWidth * 0.8;
  const top = (child ? 13 : female ? 10 : 9) - spec.headHeight * 0.6;
  const chin = (child ? 52 : female ? 55.6 : 56.6) + spec.headHeight * 0.8 + head.long * (child ? 0.3 : 1);
  const browY = (child ? 31 : 28.5) + spec.brows.dy * 0.5;
  const eyeY = (child ? 34 : 33) + spec.eyes.dy * 0.5;
  const nose = NOSES[child ? 3 : spec.nose.variant] ?? NOSES[0]!;
  const noseBottom = (child ? 42 : 45) + (child ? 0 : nose.len) + spec.nose.dy * 0.5;
  const mouthY = Math.max(noseBottom + 2.6, (child ? 45.5 : 48) + spec.mouth.dy * 0.5);
  const mouth = MOUTHS[spec.mouth.variant] ?? MOUTHS[0]!;
  return {
    spec,
    mood: MOODS[spec.expression] ?? MOODS.neutral!,
    female,
    child,
    old,
    cx: 32,
    top,
    chin,
    hw,
    cheek: hw * head.cheek,
    jaw: hw * head.jaw,
    chinW: hw * head.chin,
    browY,
    eyeY,
    eyeOff: (child ? 6.2 : 6.6) + spec.eyes.dx * 0.5,
    noseBottom,
    nose: { ...nose, w: nose.w * (female || child ? 0.85 : 1) + spec.nose.dx * 0.3 + (spec.beauty < 0 ? 0.4 : 0) },
    mouthY,
    mouth: { ...mouth, w: mouth.w * (child ? 0.8 : female ? 0.9 : 1) + spec.mouth.dx * 0.4 },
    earY: (browY + noseBottom) / 2 + 0.5 + spec.ears.dy * 0.4,
    hairline: (child ? 22 : female ? 18 : 17.5) + (spec.hair?.dy ?? 0) * 0.6,
    neckHalf: child ? 5 : female ? 5.2 : 6.5,
    shoulders: chin + (child ? 5 : 6),
    shoulderHalf: child ? 22 : female ? 26 : 32,
  };
}
