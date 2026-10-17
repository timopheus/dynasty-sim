import type { FaceSpec, Part } from '../../core/looks';
import { anatomy, type Anatomy } from './anatomy';
import type { Grid } from './grid';
import { HEIGHT, Raster, SCALE, WIDTH, smoothPath, turn, type Point } from './raster';

/**
 * The portrait as a silhouette (4.12, trial): the eighteenth century's own portrait of the common and the great —
 * a profile cut in ink against paper in an oval. The genes shape the profile (brow, bridge, nose, lips, chin, skull);
 * the mood turns the head and touches the eye and the mouth; fine lines of a lighter shade show the eye, the ear,
 * strands of hair, lace and ribbons, as on "bronzed" silhouettes. The face looks left.
 */

const PAPER = 11;
const INK = 0;

interface Profile {
  a: Anatomy;
  /** Turn of the head (radians, + bows it), round the pivot in the neck. */
  tilt: number;
  pivot: Point;
  /** Depth of the skull, from the brow to the back of the head. */
  depth: number;
  front: number;
  brow: number;
  root: number;
  noseOut: number;
  hook: number;
  tipUp: number;
  lips: number;
  chinOut: number;
}

/**
 * The frontal anatomy remapped for a profile: a head in profile is nearly as deep as it is tall, so it is drawn
 * smaller in the oval, its heights scaled from the same proportions.
 */
function profileAnatomy(spec: FaceSpec): Anatomy {
  const f = anatomy(spec);
  const top = f.child ? 18 : 13.5 - spec.headHeight * 0.5;
  const height = (f.child ? 31 : f.female ? 35 : 36.5) + spec.headHeight * 0.8 + (f.spec.head.variant === 3 ? 1.2 : f.spec.head.variant === 1 ? -0.8 : 0);
  const k = height / (f.chin - f.top);
  const y = (v: number) => top + (v - f.top) * k;
  const chin = top + height;
  return {
    ...f,
    top,
    chin,
    browY: y(f.browY),
    eyeY: y(f.eyeY),
    noseBottom: y(f.noseBottom),
    mouthY: y(f.mouthY),
    earY: y(f.earY),
    hairline: y(f.hairline),
    cheekY: y(f.cheekY),
    shoulders: chin + (f.child ? 5 : f.female ? 7.5 : 6.5),
    eye: { ...f.eye, h: f.eye.h * k },
  };
}

function profileOf(spec: FaceSpec): Profile {
  const a = profileAnatomy(spec);
  const male = !a.female && !a.child;
  const tilt = { shame: 0.13, loss: 0.1, pain: 0.05, dead: 0.12, triumph: -0.08, anger: -0.04, joy: -0.03 }[spec.expression as 'shame'] ?? 0;
  const front = 17.5 + (a.child ? 2.5 : 0);
  return {
    a,
    tilt: tilt + (a.old ? 0.04 : 0),
    pivot: [38, a.chin + 5],
    depth: (a.child ? 28 : 31) + spec.headWidth * 1 - (a.female ? 1.5 : 0),
    front,
    brow: (male ? 1.1 : 0.35) + spec.brows.dx * 0.3 + (spec.brows.variant === 2 ? 0.5 : 0),
    root: [0.9, 1.3, 0.6, 1.5, 1.1][spec.eyes.variant]! + spec.eyes.dy * 0.3,
    noseOut: ([3.3, 3.9, 3.4, 2.5, 4][a.child ? 3 : spec.nose.variant] ?? 3.3) * (a.female ? 0.9 : 1) * (a.child ? 0.75 : 1) + spec.nose.dx * 0.4 + (a.old ? 0.4 : 0),
    hook: a.nose.hook,
    tipUp: a.nose.up,
    lips: ([0.35, 0.2, 0.65, 0.45][spec.mouth.variant] ?? 0.35) + (a.female ? 0.2 : 0) - (a.old ? 0.25 : 0),
    chinOut: ([0.1, 0.4, 0.7, -0.6][spec.head.variant] ?? 0.1) - (a.female ? 0.3 : 0) - (a.child ? 0.4 : 0) + spec.head.dx * 0.3,
  };
}

/** The profile of the head and neck, from the crown round the face to the throat, then the nape and back. */
function headOutline(p: Profile): Point[] {
  const { a, front: f } = p;
  const { top, browY, eyeY, noseBottom: nb, mouthY: my, chin } = a;
  const m = a.mood;
  const smile = m.curve > 0 ? 0.3 : 0;
  const open = m.teeth ? 0.9 : m.slack ? 0.5 : 0;
  const forehead = f + ([0, 1, -0.3, 0.6][a.spec.brows.variant] ?? 0) * 0.8;
  const points: Point[] = [
    [f + 12, top - 0.5],
    [f + 5, top + 1.5],
    [forehead + 1.2, top + 6],
    [forehead, browY - 4],
    [f - p.brow, browY - 0.4],
    [f + p.root, eyeY + 0.2],
    [f - p.noseOut * 0.45 - p.hook * 0.7, (eyeY + nb) / 2],
    [f - p.noseOut, nb - 1.2 - p.tipUp * 0.6],
    [f - p.noseOut + 1 + p.tipUp * 0.3, nb - 0.1],
    [f + 1.2, nb + 0.6],
    [f + 0.7 - p.lips, my - 1],
    [f + 1.5 + smile + open * 0.8, my + open * 0.5],
    [f + 1.1 - p.lips * 0.7, my + 1.2 + open],
    [f + 2, my + 2.8],
    [f + 1.4 - p.chinOut, chin - 1.6],
    [f + 3.5 - p.chinOut * 0.5, chin],
  ];
  if (a.old) points.push([f + 6.5, chin + 1.5]);
  points.push([f + 9, chin + 1.8]);
  if (!a.female && !a.child) points.push([f + 9.3, chin + 3.2], [f + 8.6, chin + 4.2]);
  points.push([f + 10 + (a.old ? 1 : 0), a.shoulders]);
  return points;
}

function backOutline(p: Profile): Point[] {
  const { a, front: f, depth: d } = p;
  return [
    [f + 18.5, a.shoulders - 1],
    [f + 19.5, a.chin - 1],
    [f + d - 1, a.eyeY + 2],
    [f + d, a.browY - 4],
    [f + d - 2.5, a.top + 4],
    [f + 18, a.top + 0.3],
  ];
}

/** The bust: shoulders and chest, the coat or the dress cut off by the oval. */
function bust(p: Profile): Point[] {
  const { a, front: f } = p;
  const y = a.shoulders;
  const back = a.female ? 4 : 7;
  return [
    [f + 10, y - 1],
    [f + 7 - (a.female ? 1.5 : 0), y + 5],
    [f + 4, y + 12],
    [f + 3, 82],
    [f + 31 + back, 82],
    [f + 30 + back, y + 8],
    [f + 24 + back * 0.5, y + 1],
    [f + 18.5, y - 1],
  ];
}

const hairTone = (a: Anatomy) => [1, 2, 3, 5][a.spec.grey] ?? 1;

function hair(r: Raster, p: Profile, at: (pts: Point[]) => Point[]): void {
  const { a, front: f, depth: d } = p;
  const h = a.spec.hair;
  const tone = hairTone(a);
  const lines = tone + 3;
  if (!h) {
    // bald: a fringe round the back of the head
    if (!a.female && !a.child) {
      const fringe = at(smoothPath([[f + 15, a.browY + 1], [f + d - 2, a.browY - 2], [f + d + 0.4, a.eyeY + 2], [f + 19.5, a.chin - 1], [f + 16.5, a.eyeY + 1]], 3, true));
      r.poly(fringe, tone, 'hair');
    }
    return;
  }
  const hairline = a.hairline + (h.variant === 5 ? -4 : 0);
  const v = h.variant;
  const curly = v === 2;
  const grow = curly ? 2.2 : 1.3;
  const nape = a.female || v === 1 ? a.shoulders + (a.female && v !== 4 ? 6 : 1) : a.chin - 2;
  // the mass over the skull, from the hairline round the crown to the nape
  const mass: Point[] = [
    [f + 3 + (v === 5 ? 5 : 0), hairline],
    [f + 2.2, a.top + 4.5],
    [f + 5, a.top - grow + 0.5],
    [f + 12, a.top - grow - 0.6],
    [f + 19, a.top - grow + 0.6],
    [f + d + grow - 1.5, a.top + 4],
    [f + d + grow, a.browY - 3],
    [f + d + grow - 0.5, a.eyeY + 3],
  ];
  if (v === 1 || (a.female && v !== 4)) mass.push([f + d + grow + 0.5, a.chin], [f + d + 1, nape], [f + d - 3.5, nape - 1], [f + 21, a.chin]);
  else mass.push([f + 20.5, nape], [f + 18.5, nape - 1]);
  // the side: hair over the temple and before the ear, a sideburn for a man
  mass.push([f + 15.5, a.eyeY + (a.female ? 4 : 2)], [f + 13.5, a.eyeY - 1], [f + 9, hairline + 1.5]);
  const shape = smoothPath(mass, 4, true);
  const placed = at(curly ? shape.map(([x, y], i): Point => [x + (i % 3 === 0 ? 0.6 : 0), y - (i % 3 === 0 ? 0.6 : 0)]) : shape);
  r.poly(placed, tone, 'hair');
  // strands combed back from the brow
  for (let k = 0; k < 3; k++) {
    const y0 = a.top + 1.5 + k * 3.5;
    r.path(at(smoothPath([[f + 6 + k * 1.5, y0 + 1.2], [f + 13 + k, y0 - 0.4], [f + d - 4 + k, y0 + 1.5 + k]], 3)), lines, 'hair');
  }
  if (v === 4) {
    if (a.female) {
      // a knot of hair at the back of the head
      r.poly(at(smoothPath([[f + d - 2, a.top + 3], [f + d + 4, a.top + 2], [f + d + 5, a.top + 7], [f + d, a.top + 8.5]], 3, true)), tone, 'hair');
      r.path(at(smoothPath([[f + d, a.top + 4], [f + d + 3.5, a.top + 4.5], [f + d + 3, a.top + 7]], 3)), lines, 'hair');
    } else {
      // a queue tied with a black ribbon, falling down the back
      r.poly(at(smoothPath([[f + d - 2, a.eyeY + 2], [f + d + 1, a.chin - 2], [f + d + 1.5, a.shoulders + 4], [f + d - 0.5, a.shoulders + 4], [f + d - 1.5, a.chin]], 3, true)), tone, 'hair');
      r.poly(at([[f + d - 3, a.chin - 3], [f + d + 4, a.chin - 5], [f + d + 3, a.chin - 1], [f + d + 4, a.chin + 3], [f + d - 3, a.chin - 1]]), INK, 'hair');
      r.path(at([[f + d - 2, a.chin - 2.5], [f + d + 3, a.chin - 4]]), 4, 'hair');
    }
  }
  if (curly) for (let k = 0; k < 6; k++) r.ellipse(...at([[f + 5 + k * 3.4, a.top + 1 + (k % 2) * 3]])[0]!, 1, 0.8, lines, 'hair');
}

function beard(r: Raster, p: Profile, at: (pts: Point[]) => Point[]): void {
  const { a, front: f } = p;
  const b = a.spec.beard;
  if (!b) return;
  const tone = hairTone(a);
  const len = 1.5 + (b.dx + 1) * 1.2;
  const { noseBottom: nb, mouthY: my, chin } = a;
  // a moustache over the upper lip
  r.poly(at(smoothPath([[f + 1.2, nb + 0.6], [f - p.lips - 0.6, my - 0.8], [f + 0.2, my + 0.2], [f + 4, my - 0.6], [f + 4, nb + 1]], 3, true)), tone, 'beard');
  if (b.variant === 2) return;
  if (b.variant === 1) {
    r.poly(at(smoothPath([[f + 2, my + 2], [f + 0.8 - p.chinOut - len * 0.5, chin + len * 0.4], [f + 2.5, chin + len], [f + 5, chin - 1]], 3, true)), tone, 'beard');
    return;
  }
  // a beard along the jaw (short) or over the jaw and throat (full)
  const full = b.variant === 0;
  const shape: Point[] = [[f + 15, a.earY + 1.5], [f + 9, my - 1.5], [f + 2.6, my + 1.6], [f + 1 - p.chinOut - (full ? len * 0.5 : 0), chin - 1 + (full ? len * 0.4 : 0)], [f + 3, chin + (full ? len : 0.8)], [f + (full ? 10 : 9), chin + (full ? 2.5 : 1.5)], [f + 17, a.chin - 2], [f + 17, a.earY + 2]];
  r.poly(at(smoothPath(shape, 3, true)), tone, 'beard');
  for (let k = 0; k < 3; k++) r.path(at(smoothPath([[f + 6 + k * 3, my + 1], [f + 4 + k * 3, chin + (full ? len - 1 : 0)]], 2)), tone + 3, 'beard');
}

/** Hats and head cloths in profile. */
const OVAL = { cx: WIDTH / SCALE / 2, cy: HEIGHT / SCALE / 2 + 0.5, rx: 29.5, ry: 37.5 };
const inOval = (_o: string, x: number, y: number) => ((x - OVAL.cx) / OVAL.rx) ** 2 + ((y - OVAL.cy) / OVAL.ry) ** 2 <= 1;

function headwear(r: Raster, p: Profile, at: (pts: Point[]) => Point[], h: Part): void {
  const { a, front: f, depth: d } = p;
  const kinds = a.female
    ? ['mob_cap', 'lappet_cap', 'hood', 'straw_hat', 'straw_hat_tilted', 'hijab', 'headscarf', 'turban', 'tricorn']
    : ['tricorn', 'tricorn_cocked', 'tricorn_laced', 'felt_hat', 'wool_cap', 'turban', 'keffiyeh', 'fur_cap', 'wig'];
  const kind = kinds[h.variant * 3 + h.dx + 1] ?? kinds[0]!;
  const top = a.top;
  const base = a.hairline + 1 + h.dy;
  const fill = (pts: Point[], tone: number, close = true) => r.poly(at(smoothPath(pts, 3, close)), tone, 'headwear', inOval);
  const line = (pts: Point[], tone: number) => r.path(at(smoothPath(pts, 3)), tone, 'headwear');
  const s = a.female ? 0.85 : 1;
  switch (kind) {
    case 'tricorn':
    case 'tricorn_cocked':
    case 'tricorn_laced': {
      // the front corner pointing forward over the brow, the back corner behind, the cocked side rising between
      const cock = kind === 'tricorn_cocked' ? -1.5 : 0;
      fill([[f - 4 * s, base + 1 + cock], [f + 4, base - 1], [f + 14, top - 6 * s], [f + d - 3, base - 3], [f + d + 6 * s, base - 1 + cock], [f + d - 2, base + 1.5], [f + 13, base], [f + 3, base + 2.2]], INK);
      line([[f - 3.2 * s, base + 0.6 + cock], [f + 4, base - 1.6], [f + 14, top - 5.2 * s], [f + d - 3, base - 3.6], [f + d + 5 * s, base - 1.3 + cock]], kind === 'tricorn_laced' ? 9 : 4);
      if (kind === 'tricorn_laced') r.ellipse(...at([[f + 9, base - 3]])[0]!, 1.4, 1.4, 8, 'headwear');
      return;
    }
    case 'felt_hat':
      fill([[f + 3, base], [f + 4, top - 4], [f + d - 3, top - 4.5], [f + d - 2, base]], INK);
      fill([[f - 7, base + 0.6], [f + d + 7, base - 0.4], [f + d + 7, base + 0.8], [f - 7, base + 1.8]], INK);
      line([[f + 3.5, base - 2], [f + d - 2.5, base - 2.2]], 4);
      return;
    case 'wool_cap':
      fill([[f + 2.5, base + 0.5], [f + 3, top - 2], [f + 12, top - 5], [f + d - 1, top - 1], [f + d + 4, top + 5], [f + d + 1, base]], INK);
      line([[f + 2.5, base - 2.2], [f + d + 1.5, base - 2.4]], 4);
      return;
    case 'turban':
      fill([[f + 1.5 * s, base + 1], [f + 1, top + 1], [f + 8, top - 6 * s], [f + d - 2, top - 5 * s], [f + d + 3 * s, top + 3], [f + d + 1, base + 1], [f + 12, base + 2.5]], 2);
      for (let k = 0; k < 4; k++) line([[f + 1.5 + k, base - k * 2.6], [f + 12, base - 1.5 - k * 2.6], [f + d + 1, top + 2 + k * 1.2]], 6);
      return;
    case 'keffiyeh':
    case 'hijab':
    case 'hood': {
      // cloth over the head, open only at the face, falling down the back and onto the shoulders
      const tone = kind === 'keffiyeh' ? 4 : kind === 'hood' ? 1 : 2;
      const opening = kind === 'hijab' ? 8 : 6;
      fill([[f + opening - 2, a.browY - 2], [f + 2, top + 2], [f + 10, top - 2.5], [f + d + 2, top + 2], [f + d + 4, a.chin], [f + d + 8, a.shoulders + 8], [f + 14, a.shoulders + 8], [f + opening + 4, a.chin + 2], [f + opening + 1, a.mouthY], [f + opening - 1, a.eyeY]], tone);
      if (kind === 'keffiyeh') {
        line([[f + 3, top + 4], [f + d + 1.5, top + 4.6]], INK);
        line([[f + 3.3, top + 5.6], [f + d + 1.8, top + 6.2]], INK);
      }
      for (let k = 0; k < 3; k++) line([[f + d - 4 + k * 2, a.eyeY + 2], [f + d + 1 + k * 2.4, a.shoulders + 7]], tone + 3);
      return;
    }
    case 'fur_cap':
      fill([[f + 2, base + 0.5], [f + 1.5, top - 6], [f + d + 1, top - 6.5], [f + d + 1.5, base]], 2);
      for (let k = 0; k < 12; k++) r.ellipse(...at([[f + 3 + (k * 5) % (d - 2), top - 5 + (k * 3) % 9]])[0]!, 0.8, 0.6, 5, 'headwear');
      return;
    case 'wig':
      // a powdered wig: rolled curls over the ear, a black silk bag at the nape
      fill([[f + 3, a.hairline - 1], [f + 2.5, top + 3], [f + 8, top - 1.5], [f + d - 3, top - 1], [f + d + 1.5, a.browY - 2], [f + d, a.eyeY + 2], [f + 17, a.earY - 1], [f + 12, a.hairline]], 7);
      for (const y of [a.earY - 3.2, a.earY - 0.6]) {
        r.ellipse(...at([[f + 16, y]])[0]!, 4.2, 1.2, 8, 'headwear');
        r.path(at([[f + 12, y + 1], [f + 20, y + 1]]), 5, 'headwear');
      }
      fill([[f + d - 3, a.eyeY + 2], [f + d + 3, a.eyeY + 3], [f + d + 3.5, a.chin + 2], [f + d - 2, a.chin + 2]], INK);
      line([[f + d - 3, a.eyeY + 2.5], [f + d + 3, a.eyeY + 3.5]], 5);
      return;
    case 'mob_cap':
      fill([[f + 2.5, base + 1], [f + 1, top + 1], [f + 8, top - 4], [f + d - 1, top - 3.5], [f + d + 4, top + 5], [f + d + 2, a.eyeY + 3], [f + 15, a.eyeY + 1]], 9);
      for (let k = 0; k < 5; k++) r.ellipse(...at([[f + 1.6 + k * 0.4, base - 1 - k * 2.2]])[0]!, 0.9, 0.9, 7, 'headwear');
      line([[f + 3, base - 1.6], [f + d + 2, top + 4]], 5);
      return;
    case 'lappet_cap':
      fill([[f + 6, top + 2], [f + 10, top - 2.5], [f + d - 2, top - 1.5], [f + d + 1, top + 4], [f + 14, top + 4]], 9);
      fill([[f + d - 2, top + 3], [f + d + 1, top + 3.5], [f + d + 3, a.shoulders + 1], [f + d, a.shoulders + 1]], 9);
      return;
    case 'straw_hat':
    case 'straw_hat_tilted': {
      const tilt = kind === 'straw_hat_tilted' ? 2 : 0;
      fill([[f + 6, base - 1 - tilt * 0.3], [f + 7, top - 3 - tilt * 0.3], [f + d - 5, top - 3 + tilt * 0.3], [f + d - 4, base - 1 + tilt * 0.3]], 8);
      fill([[f - 10, base + 1 - tilt], [f + d + 9, base - 1 + tilt], [f + d + 9, base + tilt], [f - 10, base + 2.2 - tilt]], 7);
      line([[f + 6, base - 2.6], [f + d - 4, base - 2.6 + tilt * 0.4]], 3);
      return;
    }
    case 'headscarf':
      fill([[f + 3, base + 1.5], [f + 2, top + 1], [f + 10, top - 2.5], [f + d + 1, top + 1], [f + d + 2.5, a.eyeY + 4], [f + d + 6, a.chin + 2], [f + d + 2, a.chin + 3], [f + 17, a.earY - 1], [f + 10, base + 1]], 3);
      line([[f + 3, base], [f + d + 1, a.eyeY + 3]], 6);
      return;
  }
}

/** Clothes on the bust: a coat with its collar and a lace cravat for a man, a neckline with lace for a woman. */
function dress(r: Raster, p: Profile, at: (pts: Point[]) => Point[]): void {
  const { a, front: f } = p;
  const y = a.shoulders;
  const attire = a.spec.attire;
  const line = (pts: Point[], tone: number) => r.path(at(smoothPath(pts, 3)), (px, py) => (inOval('', (px + 0.5) / SCALE, (py + 0.5) / SCALE) ? tone : null), 'attire');
  if (a.female) {
    // the neckline, lower on a finer dress, and its edge of lace
    const deep = attire >= 2 ? 9 : 6;
    line([[f + 7.5, y + 3], [f + 13, y + deep], [f + 23, y + deep - 1], [f + 27, y + 2]], attire >= 2 ? 8 : 4);
    if (attire >= 3) for (let k = 0; k < 5; k++) r.ellipse(f + 9.5 + k * 1.6, y + 1 + k * 0.6, 0.45, 0.45, 9, 'jewel');
    if (attire === 1) line([[f + 7, y + 5], [f + 14, y + 11], [f + 26, y + 6]], 7);
    return;
  }
  // the collar of the coat standing at the nape, the line of its front
  line([[f + 19, y - 1], [f + 21.5, y + 2], [f + 24, y + 3]], 4);
  line([[f + 9, y + 2], [f + 8, y + 10], [f + 9, 82]], attire >= 3 ? 8 : 3);
  if (attire >= 1) {
    // the neckcloth at the throat and the cravat falling over the chest
    r.poly(at(smoothPath([[f + 9.5, y - 2], [f + 13, y - 1.5], [f + 12, y + 3], [f + 8.5, y + 3]], 3, true)), attire >= 2 ? 8 : 5, 'attire');
    if (attire >= 3) for (let k = 0; k < 4; k++) line([[f + 7.5 - k * 0.3, y + 3 + k * 2], [f + 10, y + 3.6 + k * 2]], 9);
  }
  if (attire >= 2) for (let k = 0; k < 4; k++) r.ellipse(f + 10.5, y + 8 + k * 3, 0.45, 0.45, 7, 'attire');
}

/** Fine details inside the ink: the eye, the brow, the ear, the line of the lips. */
function details(r: Raster, p: Profile, at: (pts: Point[]) => Point[]): void {
  const { a, front: f } = p;
  const m = a.mood;
  const ex = f + 3.4 + p.root * 0.5;
  const ey = a.eyeY;
  if (m.open <= 0.05) {
    r.path(at(smoothPath([[ex - 1.2, ey + 0.2], [ex + 0.3, ey + 0.7], [ex + 1.6, ey + 0.3]], 3)), 4, 'eyes');
  } else {
    // the eye seen from the side: an open wedge with a spark
    const o = Math.max(0.35, m.open) * a.eye.h * 0.7;
    r.poly(at(smoothPath([[ex - 1.2, ey - 0.1 + m.gaze * 0.3], [ex + 0.4, ey - o], [ex + 1.7, ey - 0.1], [ex + 0.4, ey + o * 0.7]], 3, true)), 3, 'eyes');
    r.set(...at([[ex - 0.4, ey - 0.2 + m.gaze * 0.4]])[0]!, 6, 'eyes');
    if (m.tears) r.path(at([[ex - 0.6, ey + 1.2], [ex - 0.8, ey + 3.5]]), 7, 'eyes');
  }
  // the brow: lower and drawn in when angry, lifted in grief
  const lift = -m.brows * 0.6;
  r.path(at(smoothPath([[f - p.brow + 1.2, a.browY - 0.4 - lift * 0.4], [ex + 1, a.browY - 1.2 - lift], [ex + 3.5, a.browY - 0.6 - lift * 0.5]], 3)), 2, 'brows');
  // the ear
  const earX = f + 16;
  r.path(at(smoothPath([[earX - 0.5, a.earY - 3], [earX + 1.8, a.earY - 2.5], [earX + 2.2, a.earY + 0.5], [earX + 0.8, a.earY + 2.8], [earX - 0.4, a.earY + 2.4]], 3)), 3, 'ears');
  if (a.spec.accessories.some((x) => x.slot === 'ear') && a.female) r.ellipse(...at([[earX + 0.2, a.earY + 3.8]])[0]!, 0.6, 0.8, 9, 'jewel');
  // the line between the lips, and a smile's crease
  r.path(at([[f + 1.6, a.mouthY], [f + 3.2, a.mouthY + (m.curve > 0 ? -0.5 : m.curve < 0 ? 0.5 : 0)]]), 2, 'mouth');
  if (a.spec.wrinkles && a.spec.wrinkles.level >= 2) {
    r.path(at(smoothPath([[f + 3.5, a.noseBottom + 0.5], [f + 4.5, a.mouthY + 1], [f + 4, a.mouthY + 3]], 3)), 2, 'wrinkles');
    r.path(at(smoothPath([[ex + 2.2, ey - 0.6], [ex + 3.4, ey], [ex + 2.4, ey + 0.8]], 2)), 2, 'wrinkles');
  }
  for (const s of a.spec.scars) {
    // a scar: a pale seam across the cheek or brow
    const y0 = s.variant === 3 ? a.browY - 4 : s.variant === 2 ? a.mouthY : a.cheekY - 1;
    r.path(at(smoothPath([[f + 5 + s.dx, y0 + s.dy], [f + 8 + s.dx, y0 + 2 + s.dy], [f + 10 + s.dx, y0 + 5 + s.dy]], 3)), 5, 'scars');
  }
  if (a.spec.eyepatch) {
    r.poly(at(smoothPath([[ex - 1.6, ey - 1.4], [ex + 1.8, ey - 1.6], [ex + 2, ey + 1.4], [ex - 1.4, ey + 1.4]], 3, true)), INK, 'eyepatch');
    r.path(at(smoothPath([[ex + 1.5, ey - 1], [f + 12, a.browY - 3], [f + p.depth - 2, a.top + 6]], 3)), 4, 'eyepatch');
  }
  for (const b of a.spec.bandages) {
    const y0 = b.variant === 1 ? a.cheekY : a.browY - 5;
    r.path(at(smoothPath([[f + 1.8, y0 + b.dy], [f + 12, y0 - 1 + b.dy], [f + p.depth + 0.5, y0 - 0.5 + b.dy]], 3)), 9, 'bandages');
    r.path(at(smoothPath([[f + 1.8, y0 + 1.2 + b.dy], [f + 12, y0 + 0.2 + b.dy], [f + p.depth + 0.5, y0 + 0.8 + b.dy]], 3)), 8, 'bandages');
  }
  if (a.spec.illness > 0 || a.spec.dead) r.path(at(smoothPath([[ex - 0.5, ey + 1.5], [ex + 1.5, ey + 2.2]], 2)), 3, 'illness');
}

export function silhouetteGrid(spec: FaceSpec): Grid {
  const p = profileOf(spec);
  const { a } = p;
  const r = new Raster();
  // the paper, the oval and its thin frame
  const { cx: ocx, cy: ocy } = OVAL;
  for (let py = 0; py < HEIGHT; py++) {
    for (let px = 0; px < WIDTH; px++) {
      const x = (px + 0.5) / SCALE;
      const y = (py + 0.5) / SCALE;
      const d = ((x - ocx) / OVAL.rx) ** 2 + ((y - ocy) / OVAL.ry) ** 2;
      r.setPx(px, py, d > 1.06 ? 8 : d > 1 ? 4 : PAPER - (d > 0.75 ? 1 : 0), 'background');
    }
  }
  const at = (pts: Point[]): Point[] => turn(pts, p.pivot[0], p.pivot[1], -p.tilt);
  r.poly(bust(p), INK, 'attire', inOval);
  const head = smoothPath([...headOutline(p), ...backOutline(p)], 2, true);
  r.poly(at(head), INK, 'head', inOval);
  dress(r, p, (pts) => pts);
  hair(r, p, at);
  beard(r, p, at);
  details(r, p, at);
  const hat = a.spec.accessories.find((x) => x.slot === 'head');
  if (hat) headwear(r, p, at, hat);
  return { width: WIDTH, height: HEIGHT, shades: r.shades.slice(), owner: r.owner.slice() };
}
