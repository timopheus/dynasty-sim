import type { Part } from '../../core/looks';
import { mouthLine } from './face';
import { headHalf, type Geometry } from './geometry';
import { clamp, gauss, inEllipse, lambert, smooth, type Sample } from './shape';

/** Tone of hair, brows and beard by greyness: dark, flecked, grey, white. */
const GREY_TONE = [0.08, 0.2, 0.48, 0.78];

export function hairBase(g: Geometry): number {
  return GREY_TONE[g.spec.grey] ?? GREY_TONE[0]!;
}

/** Hair lit as a mass, with strands running from the crown (or curls) and a sheen on the lit side. */
function hairTone(g: Geometry, x: number, y: number, part: Part | null): number {
  let t = hairBase(g);
  if (g.spec.grey === 1) t += 0.2 * gauss(Math.abs(x - g.cx), y, g.rx * 0.95, g.eyeY - 4, 3, 5);
  const lit = lambert(clamp((x - g.cx) / (g.rx + 3), -1, 1) * 0.9, clamp((y - g.cy) / (g.ry + 3), -1, 1) * 0.9);
  const curly = part?.variant === 2;
  const angle = Math.atan2(y - (g.top - 6), x - g.cx);
  // curls as soft round locks, not a fine pattern
  const strands = curly ? 0.035 * Math.cos(x * 0.8 + Math.sin(y * 0.7) * 1.5) * Math.cos(y * 0.75) : 0.035 * Math.cos(angle * 48);
  const sheen = 0.1 * gauss(x, y, g.cx - g.rx * 0.4, g.top + 2.5, g.rx * 0.35, 1.8);
  return t + 0.22 * lit - 0.08 + strands + sheen;
}

function isLong(g: Geometry): boolean {
  const hair = g.spec.hair;
  return !!hair && (hair.variant === 1 || (g.female && hair.variant !== 4));
}

/** Long hair falling behind the head and onto the shoulders. */
export function backHair(g: Geometry, c: Sample, x: number, y: number): void {
  const hair = g.spec.hair;
  if (!hair || !isLong(g)) return;
  const bottom = g.chin + (g.female ? 9 : 3) + hair.dx * 1.5;
  const w = g.rx + (g.female ? 2.6 : 2);
  const ad = Math.abs(x - g.cx);
  const inside = y >= g.top && y <= bottom && (y > g.cy ? ad <= w + (y - g.cy) * 0.08 - smooth(bottom - 4, bottom, y) * 2.5 : inEllipse(x, y, g.cx, g.cy, w, g.ry + 2.6));
  if (inside) c.put(1, hairTone(g, x, y, hair) - 0.05, 'hair');
}

/** The hair seen in front of the head: over the skull, down the temples, the fringe. */
function frontInside(g: Geometry, x: number, y: number): boolean {
  const hair = g.spec.hair;
  const ad = Math.abs(x - g.cx);
  const curly = hair?.variant === 2;
  const grow = curly ? 2.6 : g.female ? 2.2 : 1.7;
  const half = headHalf(g, y, grow) + (curly ? 0.6 * Math.cos(Math.atan2(y - g.cy, x - g.cx) * 18) : 0);
  if (ad > half) return false;
  const skull = headHalf(g, y);
  if (!hair) {
    // bald: a band of hair round the back of the head, over the ears
    return !g.female && !g.child && ad > skull - 2 && y > g.browY - 1 && y < g.earY + 1;
  }
  const h = g.hairline;
  const r = ad / g.rx;
  let line: number;
  let temples: number;
  if (g.female && hair.variant !== 2 && hair.variant !== 4) {
    // parted in the middle and drawn to the sides over the ears
    if (ad < 0.45 && y < h - 0.5) return false;
    line = h - 1.2 + 2.2 * r - 2.4 * smooth(0.7, 1, r);
    temples = g.earY + 4;
  } else {
    switch (hair.variant) {
      case 3: {
        // parted on one side, the hair swept across
        const px = g.cx - 4.5;
        if (Math.abs(x - px) < 0.4 && y < h - 1) return false;
        line = h + 1.8 * smooth(px, g.cx + g.rx, x) - 1.2 * smooth(0.7, 1, r);
        temples = g.browY + 1;
        break;
      }
      case 5:
        // a high forehead: the hairline goes back at the temples
        line = h - 3.5 * smooth(0.12, 0.6, r) + 0.8 * (1 - smooth(0, 0.15, r));
        temples = g.browY;
        break;
      case 4:
        // drawn back tight to a queue or a bun
        line = h - 1 + 0.6 * r * r;
        temples = g.browY;
        break;
      case 1:
        line = h - 0.3 * r;
        temples = g.earY + 3;
        break;
      case 2:
        line = h + 0.6 * Math.cos(x * 1.2);
        temples = g.browY + 2;
        break;
      default:
        line = h + 1 * r * r - 1.5 * smooth(0.75, 1, r);
        temples = g.browY + 1;
    }
  }
  if (g.child) line += 0.5;
  if (y < line) return true;
  return ad > skull - (g.female ? 2.6 : 1.6) && y < temples;
}

export function frontHair(g: Geometry, c: Sample, x: number, y: number): void {
  if (!frontInside(g, x, y)) return;
  c.put(1, hairTone(g, x, y, g.spec.hair), 'hair');
}

/** A bun on a woman's head; a queue tied with a ribbon at a man's nape, seen beside the neck. */
export function tiedHair(g: Geometry, c: Sample, x: number, y: number): void {
  const hair = g.spec.hair;
  if (!hair || hair.variant !== 4 || g.child) return;
  if (g.female) {
    if (inEllipse(x, y, g.cx, g.top - 1.5, 4.2, 3)) c.put(1, hairTone(g, x, y, hair) + 0.03 * Math.cos((x - g.cx) * 2 + y), 'hair');
    return;
  }
  const bx = g.cx + g.rx * 0.62;
  const by = g.chin - 1;
  if (inEllipse(x, y, bx - 1.8, by, 1.8, 1.2) || inEllipse(x, y, bx + 1.8, by, 1.8, 1.2)) c.put(1, 0.12 + 0.18 * gauss(x, y, bx - 2, by - 0.5, 1, 0.6), 'hair');
}

/** A beard grows from the jaw and round the mouth, always on the middle line of the face. */
export function beard(g: Geometry, c: Sample, x: number, y: number): void {
  const b = g.spec.beard;
  if (!b) return;
  const ad = Math.abs(x - g.cx);
  const { y: ly, s } = mouthLine(g, x);
  const half = headHalf(g, y);
  const length = 2.5 + (b.dx + 1) * 1.3;
  const chinHalf = g.rx * g.head.chin + 1.5;
  const belowChin = y >= g.chin - 1 && y < g.chin + length && ad < chinHalf * (1 - smooth(g.chin, g.chin + length, y) * 0.55);
  const onFace = ad <= half || belowChin;
  const noseBase = g.noseBottom + 0.8;
  const moustacheEnd = g.mouth.w + 1.1;
  const moustache = y > noseBase + 0.6 && y < ly - 0.2 && ad < moustacheEnd - 1.2 + (y - noseBase) * 0.6 && ad > 0.25;
  let cover = 0;
  switch (b.variant) {
    case 1: {
      // a pointed beard on the chin and a moustache
      const goatee = y > g.mouthY + g.mouth.low + 1.2 && ad < 3 * (1 - smooth(g.chin - 2, g.chin + length, y) * 0.8) && y < g.chin + length;
      cover = moustache || goatee ? 1 : 0;
      break;
    }
    case 2: {
      // a moustache, its ends drawn down past the corners of the mouth
      const ends = Math.abs(ad - moustacheEnd) < 0.8 && y >= ly - 1 && y < ly + 2.2;
      cover = moustache || ends ? 1 : 0;
      break;
    }
    case 3: {
      // a short beard along the jaw and over the chin
      const jaw = onFace && y > g.earY + 1 && half - ad < 2.2;
      const chin = onFace && y > g.mouthY + g.mouth.low + 1.3;
      cover = moustache || jaw || chin ? 1 : 0;
      break;
    }
    default: {
      // a full beard; its upper edge fades into the cheeks
      const edge = g.mouthY - 1.8 - 6 * smooth(0.2, 0.95, ad / g.rx);
      cover = onFace ? smooth(edge - 1, edge + 1.2, y) : 0;
    }
  }
  // the lips stay clear
  if (Math.abs(s) < 1 && y > ly - 0.9 && y < ly + g.mouth.low + 1 + g.x.open) cover = Math.min(cover, b.variant === 2 && y < ly ? cover : 0);
  if (cover <= 0) return;
  const lit = lambert(clamp((x - g.cx) / (g.rx + 1), -1, 1) * 0.8, clamp((y - g.cy) / (g.ry + 3), -1, 1) * 0.8);
  c.put(cover, hairBase(g) + 0.24 * lit + 0.03 + 0.05 * Math.cos(x * 2.3 + y * 0.7), 'beard');
}
