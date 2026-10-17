import type { Anatomy } from './anatomy';
import { mirror, type Point, type Raster } from './raster';

/**
 * The head drawn in planes (4.12, D-305): the light falls from the upper left, so the planes facing it — forehead,
 * the left cheek, the bridge of the nose, the chin — are light, the planes turned from it dark. Each plane is one
 * shade; its corners hang on the anatomy, so the genes reshape the planes instead of swapping pictures.
 */

const onHead = (o: string) => o === 'head';

/** The outline of the right half of the head, from the crown down to the chin. */
function outline(a: Anatomy): Point[] {
  const { cx, top, hw, cheek, jaw, chinW, chin, browY, eyeY, mouthY } = a;
  return [
    [cx, top],
    [cx + hw * 0.38, top + 0.5],
    [cx + hw * 0.7, top + 3],
    [cx + hw * 0.9, top + 7],
    [cx + hw, top + 13],
    [cx + hw + 0.3, browY - 0.5],
    [cx + hw - 0.4, eyeY - 1],
    [cx + cheek, eyeY + 3],
    [cx + cheek - 0.6, eyeY + 8],
    [cx + (cheek + jaw) / 2 + 0.6, mouthY - 2],
    [cx + jaw, mouthY + 2.5],
    [cx + (jaw + chinW) / 2 + 0.4, chin - 2.6],
    [cx + chinW, chin - 0.6],
    [cx, chin],
  ];
}

export function headShape(a: Anatomy): Point[] {
  const right = outline(a);
  return [...right, ...mirror(right, a.cx).reverse()];
}

export function ears(r: Raster, a: Anatomy): void {
  const v = a.spec.ears.variant;
  const sy = [1, 1.2, 1.05][v] ?? 1;
  const sx = ([1, 1.1, 1.45][v] ?? 1) * (a.spec.ears.dx < 0 ? 0.85 : 1);
  const y = a.earY;
  const x = a.cx + a.hw - 0.6;
  const place = (pts: Point[]): Point[] => pts.map(([dx, dy]) => [x + dx * sx, y + dy * sy]);
  const ear = place([[0, -5], [2, -6], [3.5, -3], [3, 3], [1, 6], [-0.5, 5]]);
  const bowl = place([[0.5, -3], [2, -3], [1.6, 2], [0.5, 2]]);
  r.poly(ear, 5, 'ears');
  r.poly(bowl, 3, 'ears');
  r.poly(mirror(ear, a.cx), 8, 'ears');
  r.poly(mirror(bowl, a.cx), 6, 'ears');
}

export function neck(r: Raster, a: Anatomy): void {
  const { cx, chin, neckHalf: n, shoulders } = a;
  const t = chin - 7;
  r.poly([[cx - n, t], [cx + n, t], [cx + n + 1, shoulders + 3], [cx, shoulders + 5], [cx - n - 1, shoulders + 3]], 6, 'neck');
  r.poly([[cx - n, t], [cx - 1, t], [cx - 1, shoulders + 4], [cx - n - 1, shoulders + 3]], 8, 'neck');
  // the jaw casts a band of shadow down the neck
  r.poly([[cx - n, chin - 4], [cx + n, chin - 4], [cx + n, chin + 0.6], [cx - n, chin - 0.4]], 3, 'neck', (o) => o === 'neck');
  if (!a.female && !a.child) r.set(cx - 1, chin + 2, 8, 'neck');
}

export function skull(r: Raster, a: Anatomy): void {
  const { cx, top, hw, cheek, jaw, chinW, chin, browY, eyeY, noseBottom, mouthY } = a;
  const soft = a.female || a.child;
  const gaunt = a.old || a.spec.illness > 1 || a.spec.dead;
  r.poly(headShape(a), 7, 'head');
  // the half toward the light
  r.poly([[cx - hw - 1, top + 11], [cx - hw + 1.5, top + 5], [cx - 10, top + 1], [cx, top], [cx + 1, browY + 1.5], [cx, chin], [cx - 6, chin - 2.6], [cx - 11, mouthY + 2.5], [cx - 14, mouthY - 2], [cx - hw, eyeY + 5]], 9, 'head', onHead);
  // the forehead facing the light
  r.poly([[cx - 8, top + 3], [cx + 6, top + 3], [cx + 9, top + 9], [cx + 8.5, browY - 2.5], [cx, browY - 1.5], [cx - 9.5, browY - 2.5], [cx - 10.5, top + 9]], 10, 'head', onHead);
  r.poly([[cx, top + 3], [cx + 6, top + 3], [cx + 9, top + 9], [cx + 8.5, browY - 2.5], [cx, browY - 1.5]], 9, 'head', onHead);
  // the side turning from the light, and its darkest strip
  r.poly([[cx + 12, top + 5], [cx + hw + 1, top + 11], [cx + hw + 1, browY], [cx + hw + 1, eyeY - 1], [cx + cheek + 1, eyeY + 3], [cx + cheek + 1, eyeY + 8], [cx + (cheek + jaw) / 2 + 1, mouthY - 2], [cx + jaw + 1, mouthY + 2.5], [cx + jaw - 1.6, mouthY - 2], [cx + cheek - 4.5, eyeY + 5], [cx + 12, browY - 1]], 5, 'head', onHead);
  r.poly([[cx + hw - 1.5, top + 13], [cx + hw + 1, browY], [cx + hw + 1, eyeY - 1], [cx + cheek + 1, eyeY + 3], [cx + cheek + 1, eyeY + 8], [cx + (cheek + jaw) / 2 + 1, mouthY - 2], [cx + cheek - 3, eyeY + 5], [cx + hw - 2, browY + 3]], 4, 'head', onHead);
  // brow ridge
  r.poly([[cx - 12, browY - 1.5], [cx - 1, browY - 1.5], [cx - 1, browY + 1], [cx - 12, browY + 1.5]], 10, 'head', onHead);
  r.poly([[cx + 1, browY - 1.5], [cx + 12, browY - 1.5], [cx + 12, browY + 1.5], [cx + 1, browY + 1]], 8, 'head', onHead);
  // eye sockets
  r.poly([[cx - 11.5, browY + 1.5], [cx - 1.5, browY + 1], [cx - 1.5, eyeY + 3], [cx - 10, eyeY + 3]], 7, 'head', onHead);
  r.poly([[cx + 1.5, browY + 1], [cx + 11.5, browY + 1.5], [cx + 10, eyeY + 3], [cx + 1.5, eyeY + 3]], 5, 'head', onHead);
  // cheeks facing front
  r.poly([[cx - 14, eyeY + 3], [cx - 2, eyeY + 3], [cx - 3, eyeY + 10], [cx - 12, eyeY + 11]], 10, 'head', onHead);
  r.poly([[cx + 2, eyeY + 3], [cx + 12.5, eyeY + 3], [cx + 11, eyeY + 11], [cx + 3, eyeY + 10]], 7, 'head', onHead);
  // the hollows under the cheekbones: faint on women and children, deep on the old, the ill and the dead
  r.poly([[cx - 13, eyeY + 11], [cx - 6, eyeY + 10], [cx - 5, mouthY + 2], [cx - 10, mouthY + 2]], gaunt ? 7 : soft ? 9 : 8, 'head', onHead);
  r.poly([[cx + 6, eyeY + 10], [cx + 12.5, eyeY + 11], [cx + 10, mouthY + 2], [cx + 5, mouthY + 2]], gaunt ? 3 : soft ? 6 : 4, 'head', onHead);
  // the muzzle round the mouth and the chin
  r.poly([[cx - 6, noseBottom], [cx, noseBottom - 0.5], [cx, chin - 3.6], [cx - 5, chin - 4.6]], 9, 'head', onHead);
  r.poly([[cx, noseBottom - 0.5], [cx + 6, noseBottom], [cx + 5, chin - 4.6], [cx, chin - 3.6]], 6, 'head', onHead);
  r.poly([[cx - 4, chin - 4.6], [cx, chin - 5], [cx, chin + 1], [cx - 3, chin]], 10, 'head', onHead);
  r.poly([[cx, chin - 5], [cx + 4, chin - 4.6], [cx + 3, chin], [cx, chin + 1]], 7, 'head', onHead);
  // the underside of the jaw
  r.poly([[cx + 5, chin - 4.6], [cx + jaw + 1, mouthY + 2.5], [cx + (jaw + chinW) / 2 + 1, chin - 2.6], [cx + 3, chin + 1]], soft ? 4 : 3, 'head', onHead);
}

export function nose(r: Raster, a: Anatomy): void {
  const { cx, browY, noseBottom: nb, nose: n } = a;
  const w = n.w;
  // the bridge in light, its shaded side (bulging on a hooked nose), the faint lit side
  r.poly([[cx - 1.5, browY + 1.5], [cx + 0.5, browY + 1.5], [cx + 0.6, nb - 3], [cx - 1.6, nb - 3]], 10, 'head');
  const mid = (browY + nb) / 2;
  r.poly([[cx + 0.5, browY + 1.5], [cx + 2, browY + 2.5], [cx + 2 + n.hook, mid], [cx + w, nb - 2.5], [cx + 0.6, nb - 3]], 5, 'head');
  r.poly([[cx - 1.5, browY + 2], [cx - 2.5, browY + 3], [cx - w + 0.5, nb - 3], [cx - 1.6, nb - 3]], 8, 'head');
  // the tip and the wings
  r.poly([[cx - 2.5, nb - 4], [cx + 1.5, nb - 4], [cx + w * 0.9 + 0.4, nb - 1.5], [cx + 1, nb], [cx - 1.5, nb], [cx - w * 0.9 - 0.4, nb - 1.5]], 10, 'head');
  r.poly([[cx + 1, nb - 3.5], [cx + w + 0.4, nb - 2], [cx + w + 0.3, nb - 0.5], [cx + 1, nb]], 6, 'head');
  // the base of the nose in shadow, and the nostrils
  r.poly([[cx - w - 0.8, nb - 0.5], [cx + w + 0.8, nb - 0.5], [cx + w, nb + 1], [cx - w, nb + 1]], 4, 'head');
  const left = Math.floor(cx - w * 0.85);
  const right = Math.floor(cx + w * 0.55);
  const y = Math.floor(nb - 1);
  r.set(left, y, 2, 'nose');
  r.set(left + 1, y, 3, 'nose');
  r.set(right, y, 2, 'nose');
  r.set(right + 1, y, 1, 'nose');
  if (n.up) {
    r.set(left + 1, y - 1, 4, 'nose');
    r.set(right, y - 1, 3, 'nose');
  }
}

/** Darker shades of the shaded side: the right eye is drawn as the left mirrored, in shade. */
const SHADE_SIDE: Record<string, string> = { b: '9', a: '8', '9': '7', '8': '6', '7': '5', '6': '4', '5': '4', '4': '3', '3': '2' };
const shaded = (rows: readonly string[]) => rows.map((row) => [...row].map((ch) => SHADE_SIDE[ch] ?? ch).join(''));

/** The left eye (on the lit side) by variant and mood; the outer corner is on the left. */
function eyeRows(a: Anatomy): string[] {
  const crease = ['.655555.', '6111111.', '.655555.', '.444444.', '........'][a.spec.eyes.variant] ?? '.655555.';
  const ball = ['.3a201a6', '.3a201a6', '.3a201a6', '.3a201a6', '.392019.'][a.spec.eyes.variant] ?? '.3a201a6';
  const lower = '..67778.';
  switch (a.mood.eyes) {
    case 'closed':
      return [crease, '........', '.2111112', '..6777..'];
    case 'wince':
      return ['.111111.', '..1111..', '.2111112', '..6666..'];
    case 'narrow':
      return [crease, '........', '.1111111', ball.replace(/a/g, '8'), '..6777..'];
    case 'down':
      return [crease, '........', '.1111111', '.3a221a6'.replace('22', '20'), lower];
    default:
      if (a.spec.eyes.variant === 2) return [crease, '.1111111', '.3a221a6', ball, lower];
      return [crease, '.1111111', ball, lower];
  }
}

export function eyes(r: Raster, a: Anatomy): void {
  const rows = eyeRows(a);
  const y = Math.round(a.eyeY) - 2;
  const lx = Math.round(a.cx - a.eyeOff) - 4;
  const rx = Math.round(a.cx + a.eyeOff) - 4;
  const ill = a.spec.illness;
  if (a.spec.eyepatch !== 'left') {
    r.sprite(rows, lx, y, 'eyes');
    if (a.female && a.mood.eyes !== 'closed') r.set(lx, y + 1, 1, 'eyes');
    if (a.mood.tears) r.sprite(['b', 'a', 'b'], lx + 5, y + rows.length, 'eyes');
    if (ill > 0) r.sprite(['.6666.'], lx + 1, y + rows.length, 'illness');
  }
  if (a.spec.eyepatch !== 'right') {
    r.sprite(shaded(rows), rx, y, 'eyes', true);
    if (a.female && a.mood.eyes !== 'closed') r.set(rx + 7, y + 1, 1, 'eyes');
    if (ill > 0) r.sprite(['.3333.'], rx + 1, y + rows.length, 'illness');
  }
}

const BROWS = [
  ['.11111...', '1.....111'],
  ['..1111...', '.1....11.', '1.......1'],
  ['.1111111.', '111111111'],
  ['....11111', '11111....'],
];

export function brows(r: Raster, a: Anatomy, tone: number): void {
  const base = BROWS[a.spec.brows.variant] ?? BROWS[0]!;
  const lift = a.mood.brows + (a.spec.expression === 'neutral' && a.spec.temper < 0 ? 1 : 0);
  const thin = a.female && base.length === 2 && a.spec.brows.variant === 2 ? [base[0]!] : base;
  const y = Math.round(a.browY) - 1;
  const lx = Math.round(a.cx - a.eyeOff) - 5 + (a.spec.brows.dx < 0 ? 1 : 0);
  const rx = Math.round(a.cx + a.eyeOff) - 4 - (a.spec.brows.dx < 0 ? 1 : 0);
  thin.forEach((row, dy) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== '1') continue;
      // the inner end (toward the nose) drops with anger and rises with grief
      const shift = i >= 6 ? Math.sign(lift) * (lift !== 0 ? 1 : 0) : 0;
      r.set(lx + i, y + dy + shift, tone, 'brows');
      r.set(rx + (row.length - 1 - i), y + dy + shift, tone, 'brows');
    }
  });
}

export function mouth(r: Raster, a: Anatomy): void {
  const { cx, mood, female } = a;
  const w = Math.round(a.mouth.w);
  const y = Math.round(a.mouthY);
  const x0 = cx - w;
  const x1 = cx + w - 1;
  const lip = (x: number) => (x < cx ? (female ? 5 : 6) : female ? 4 : 5);
  const lower = (x: number) => (x < cx - 1 ? (female ? 7 : 10) : x < cx + 1 ? (female ? 7 : 9) : female ? 6 : 8);
  if (mood.teeth) {
    // lips drawn back over the teeth
    for (let x = x0 + 1; x <= x1 - 1; x++) {
      r.set(x, y - 1, lip(x), 'mouth');
      r.set(x, y, 1, 'mouth');
      r.set(x, y + 1, x === x0 + 1 || x === x1 - 1 ? 2 : 10, 'mouth');
      r.set(x, y + 2, 1, 'mouth');
      r.set(x, y + 3, lower(x) - 1, 'mouth');
    }
    r.set(x0, y + (mood.curve < 0 ? 2 : 1), 3, 'mouth');
    r.set(x1, y + (mood.curve < 0 ? 2 : 1), 3, 'mouth');
    return;
  }
  if (mood.slack) {
    for (let x = x0 + 1; x <= x1 - 1; x++) r.set(x, y, 2, 'mouth');
    for (let x = x0 + 2; x <= x1 - 2; x++) r.set(x, y + 1, 1, 'mouth');
    return;
  }
  // the upper lip in shade, the line between the lips, the lit lower lip and the shadow beneath it
  if (!mood.pressed) for (let x = x0 + 1; x <= x1 - 1; x++) r.set(x, y - 1, x === x0 + 1 || x === x1 - 1 ? 7 : lip(x), 'mouth');
  for (let x = x0 + 1; x <= x1 - 1; x++) r.set(x, y, x === x0 + 1 || x === x1 - 1 ? 2 : 1, 'mouth');
  // the corners: up in a smile, down in grief, one up in a grin
  const leftY = y - (mood.curve > 0 ? 1 : 0) + (mood.curve < 0 ? 1 : 0);
  const rightY = y - (mood.curve > 0 || mood.smirk > 0 ? 1 : 0) + (mood.curve < 0 ? 1 : 0);
  r.set(x0, leftY, 3, 'mouth');
  r.set(x1, rightY, 3, 'mouth');
  if (mood.smirk > 0) r.set(x1 - 1, y - 1, 2, 'mouth');
  if (mood.pressed) return;
  for (let x = x0 + 2; x <= x1 - 2; x++) r.set(x, y + 1, lower(x), 'mouth');
  if (a.mouth.full || female) for (let x = x0 + 3; x <= x1 - 3; x++) r.set(x, y + 2, lower(x) - 1, 'mouth');
  const under = y + (a.mouth.full || female ? 3 : 2);
  for (let x = x0 + 3; x <= x1 - 3; x++) r.set(x, under, x < cx ? 7 : 5, 'head');
}

export function mole(r: Raster, a: Anatomy): void {
  if (a.spec.beauty < 0) r.set(Math.round(a.cx + 6.5), Math.round(a.noseBottom + 0.5), 2, 'mole');
}

/** Lines of age: the forehead, under the eyes, crow's feet, the folds from the nose past the mouth. */
export function wrinkles(r: Raster, a: Anatomy): void {
  const w = a.spec.wrinkles;
  if (!w) return;
  const { cx, browY, eyeY, noseBottom, mouthY } = a;
  const line = (y: number, x0: number, x1: number) => {
    for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      if (w.variant === 1 && Math.abs(x - cx) < 2) continue;
      const bend = w.variant === 2 ? (Math.abs(x - cx) > 4 ? -1 : 0) : 0;
      if (r.ownerAt(x, y + bend) === 'head') r.set(x, y + bend, x < cx ? 6 : 4, 'wrinkles');
    }
  };
  line(Math.round(browY - 6 + w.dy * 0.5), cx - 7 + w.dx, cx + 5 + w.dx);
  if (w.level >= 2) {
    line(Math.round(browY - 3.5), cx - 5, cx + 4);
    r.sprite(['667.'], Math.round(cx - a.eyeOff) - 3, Math.round(eyeY) + 2, 'wrinkles');
    r.sprite(['.445'], Math.round(cx + a.eyeOff), Math.round(eyeY) + 2, 'wrinkles');
    r.set(Math.round(cx - a.eyeOff) - 5, Math.round(eyeY), 6, 'wrinkles');
    r.set(Math.round(cx + a.eyeOff) + 4, Math.round(eyeY), 3, 'wrinkles');
  }
  if (w.level >= 3) {
    r.line(cx - a.nose.w - 2, noseBottom, cx - a.mouth.w - 2, mouthY + 1, 6, 'wrinkles');
    r.line(cx + a.nose.w + 2, noseBottom, cx + a.mouth.w + 2, mouthY + 1, 3, 'wrinkles');
  }
}

/** Pallor of illness and death: the skin lighter and flatter. */
export function pallor(r: Raster, a: Anatomy): void {
  if (a.spec.illness === 0 && !a.spec.dead) return;
  for (let i = 0; i < r.shades.length; i++) {
    if (r.owner[i] === 'head' || r.owner[i] === 'ears' || r.owner[i] === 'neck') r.shades[i] = Math.min(10, Math.round(r.shades[i]! * 0.75 + 2.5));
  }
}
