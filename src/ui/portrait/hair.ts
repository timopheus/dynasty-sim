import type { Anatomy } from './anatomy';
import { headShape } from './head';
import { mirror, smoothPath, type Point, type Raster } from './raster';

/**
 * Hair and beards in flat masses (4.12, D-305): a main shade, a lit side and a sheen; grey turns the masses light.
 */

/** Shades of hair by greyness: dark, flecked, grey, white — main, lit, deep. */
export function hairTones(a: Anatomy): { main: number; lit: number; deep: number } {
  return [
    { main: 1, lit: 3, deep: 0 },
    { main: 2, lit: 5, deep: 1 },
    { main: 5, lit: 7, deep: 3 },
    { main: 8, lit: 10, deep: 6 },
  ][a.spec.grey] ?? { main: 1, lit: 3, deep: 0 };
}

const S = (a: Anatomy, k: number) => (a.hw / 16) * k;

/** The outer edge of a hair mass: the head's outline grown outward, from the crown down to `down` on each side. */
function cap(a: Anatomy, grow: number, down: number, bumps = 0): Point[] {
  const right: Point[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const angle = (t * Math.PI) / 2;
    const y = a.top - grow + (down - a.top + grow) * (1 - Math.cos(angle));
    const x = a.cx + (a.hw + grow) * Math.sin(angle) ** 0.8;
    const b = bumps ? bumps * (i % 2 === 0 ? 1 : -0.4) : 0;
    right.push([x + b, y - (i < 11 ? b * 0.6 : 0)]);
  }
  return [...mirror(right, a.cx).reverse(), ...right];
}

/** The hairline: the inner edge of the hair over the forehead and down the temples. */
function hairline(a: Anatomy, down: number, kind: 'even' | 'parted' | 'side' | 'receding'): Point[] {
  const { cx, hairline: h, hw } = a;
  const inner = hw - (a.female ? 2.6 : 1.5);
  let mid: Point[];
  switch (kind) {
    case 'parted':
      mid = [[cx + inner, h + 4], [cx + hw * 0.6, h + 1], [cx + 2, h - 1.5], [cx, h - 2.5], [cx - 2, h - 1.5], [cx - hw * 0.6, h + 1], [cx - inner, h + 4]];
      break;
    case 'side':
      mid = [[cx + inner, h + 4.5], [cx + hw * 0.55, h + 2.5], [cx + 2, h + 1.5], [cx - 4, h - 1], [cx - 5, h - 2.5], [cx - 6, h - 0.5], [cx - hw * 0.7, h + 0.5], [cx - inner, h + 3]];
      break;
    case 'receding':
      mid = [[cx + inner, h + 2], [cx + hw * 0.62, h - 3.5], [cx + 2.5, h - 1], [cx, h + 0.8], [cx - 2.5, h - 1], [cx - hw * 0.62, h - 3.5], [cx - inner, h + 2]];
      break;
    default:
      mid = [[cx + inner, h + 4], [cx + hw * 0.62, h + 0.6], [cx + hw * 0.25, h - 0.2], [cx, h + 0.4], [cx - hw * 0.25, h - 0.2], [cx - hw * 0.62, h + 0.6], [cx - inner, h + 4]];
  }
  return [[cx + inner + 0.3, down], ...mid, [cx - inner - 0.3, down]];
}

function long(a: Anatomy): boolean {
  const v = a.spec.hair?.variant;
  return v === 1 || (a.female && v !== 4 && v !== undefined);
}

/** Hair seen behind the head: long hair falling to the shoulders, a queue's ribbon at the nape. */
export function backHair(r: Raster, a: Anatomy): void {
  const hair = a.spec.hair;
  if (!hair) return;
  const t = hairTones(a);
  const { cx, hw, browY, chin, shoulders } = a;
  if (long(a)) {
    // the mass of the hair behind the head and shoulders
    const { fall, out } = lockSize(a);
    r.poly(smoothPath([[cx - out + 0.5, browY - 4], [cx - out - 0.6, chin - 4], [cx - out, fall - 3], [cx + out, fall - 3], [cx + out + 0.6, chin - 4], [cx + out - 0.5, browY - 4]], 4, true), t.deep, 'hair');
  } else if (hair.variant === 4 && !a.female && !a.child) {
    // a queue tied with a dark ribbon, its bow seen beside the neck
    const bx = cx + hw * 0.55;
    const by = chin + 1;
    r.poly([[bx - 4, by - 2], [bx, by], [bx - 4, by + 2]], 1, 'hair');
    r.poly([[bx + 4, by - 2], [bx, by], [bx + 4, by + 2]], 2, 'hair');
  }
}

function lockSize(a: Anatomy): { fall: number; out: number } {
  const dx = a.spec.hair?.dx ?? 0;
  return { fall: (a.female ? a.shoulders + 8 : a.chin + 4) + dx * 2, out: a.hw + (a.female ? 3.2 : 2.4) };
}

/** Every beard has a moustache; it lies over the upper lip, so it is drawn after the mouth. */
export function moustache(r: Raster, a: Anatomy): void {
  if (!a.spec.beard) return;
  const t = hairTones(a);
  const { cx, noseBottom: nb, mouthY: my } = a;
  const mw = a.mouth.w;
  const shape = smoothPath([[cx - mw - 1, my + 0.3], [cx - mw + 0.4, my - 1.5], [cx - 1.6, nb + 1.3], [cx, nb + 1.8], [cx + 1.6, nb + 1.3], [cx + mw - 0.4, my - 1.5], [cx + mw + 1, my + 0.3], [cx + mw - 1, my - 0.4], [cx, my - 0.5], [cx - mw + 1, my - 0.4]], 3, true);
  r.poly(shape, t.main, 'beard');
  r.poly([...shape.filter(([x]) => x < cx - 0.5), [cx - 0.5, nb + 1.8]], t.lit, 'beard', (o) => o === 'beard');
  r.line(cx, nb + 1.8, cx, my - 0.6, t.deep, 'beard');
}

/** Long hair falls in two locks over the shoulders, narrowing to their ends, strands of light running down them. */
export function hairLocks(r: Raster, a: Anatomy): void {
  if (!a.spec.hair || !long(a)) return;
  const t = hairTones(a);
  const { cx, browY, chin, neckHalf: n, shoulders } = a;
  const { fall, out } = lockSize(a);
  for (const side of [-1, 1]) {
    const lock: Point[] = [[cx + side * (out - 2.5), browY], [cx + side * (out - 0.5), browY - 4], [cx + side * (out + 0.6), chin - 4], [cx + side * (out + 0.2), fall - 4], [cx + side * (out - 2.2), fall], [cx + side * (n + 3.5), shoulders + 2], [cx + side * (n + 1.2), chin - 1]];
    r.poly(smoothPath(lock, 4, true), side < 0 ? t.main + 1 : t.main, 'hair');
    for (let k = 0; k < 3; k++) {
      const x = cx + side * (out - 0.8 - k * 1.4);
      r.path(smoothPath([[x, browY + 2 + k * 2], [x + side * 0.4, chin - 2], [x - side * (1 + k * 0.6), fall - 2 - k]], 3), side < 0 ? t.lit + 1 : Math.max(0, t.main - 1), 'hair');
    }
  }
}

/** Hair over the head: the cap, the temples, a fringe; a bald man keeps a band over the ears. */
export function frontHair(r: Raster, a: Anatomy): void {
  const hair = a.spec.hair;
  const t = hairTones(a);
  const { cx, hw, top, browY, earY } = a;
  if (!hair) {
    if (a.female || a.child) return;
    for (const side of [-1, 1]) {
      const band: Point[] = [[cx + side * (hw + 1.2), browY - 4], [cx + side * (hw + 1.4), earY + 2], [cx + side * (hw - 1.4), earY + 1], [cx + side * (hw - 1.6), browY - 3]];
      r.poly(band, side < 0 ? t.lit : t.main, 'hair');
    }
    return;
  }
  const v = hair.variant;
  const parted = a.female && v !== 2 && v !== 4;
  const curly = v === 2;
  const down = parted ? earY + 5 : v === 1 ? earY + 2 : browY + 1.5;
  const outer = cap(a, curly ? 2.6 : a.female ? 2 : 1.5, down, curly ? 1 : 0);
  const kind = parted ? 'parted' : v === 3 ? 'side' : v === 5 ? 'receding' : 'even';
  const inner = hairline(a, down, kind);
  // the mass: everything inside the outer edge and above the hairline
  const mass: Point[] = [...outer.slice(0, outer.length), ...inner];
  r.poly(mass, t.main, 'hair');
  // light on the left of the crown, a sheen, the deep right side
  r.poly([[cx - hw - 2, down], [cx - hw - 1.5, top + 8], [cx - hw * 0.6, top + 1], [cx - 2, top - 1], [cx - hw * 0.45, top + 4], [cx - hw * 0.8, top + 10], [cx - hw + 1.5, down]], t.lit, 'hair', (o) => o === 'hair');
  r.poly([[cx - hw * 0.45, top + 1.5], [cx - 1, top - 0.5], [cx - 2.5, top + 2], [cx - hw * 0.5, top + 4]], t.lit + 1, 'hair', (o) => o === 'hair');
  r.poly([[cx + hw - 1, top + 9], [cx + hw + 2.5, top + 12], [cx + hw + 2.5, down], [cx + hw - 1, down]], t.deep, 'hair', (o) => o === 'hair');
  if (parted) r.line(cx, top - 1, cx, a.hairline - 2, t.lit + 1, 'hair');
  if (v === 3 && !a.female) r.line(cx - 5, top + 1, cx - 5, a.hairline - 2, t.lit + 1, 'hair');
  if (curly) {
    // locks: short arcs of light across the mass
    for (let i = 0; i < 7; i++) {
      const x = cx - hw + 3 + i * S(a, 4.2);
      const y = top + 2 + (i % 2) * 3;
      r.line(x, y, x + 2, y + 1, t.lit, 'hair');
    }
  }
  if (v === 4 && a.female) {
    // a bun on top of the head
    r.ellipse(cx, top - 1.5, 4.5, 3.2, t.main, 'hair');
    r.ellipse(cx - 1.2, top - 2.4, 2.2, 1.4, t.lit, 'hair');
  }
}

export function beard(r: Raster, a: Anatomy): void {
  const b = a.spec.beard;
  if (!b) return;
  const t = hairTones(a);
  const { cx, noseBottom: nb, mouthY: my, chin, jaw } = a;
  const mw = a.mouth.w;
  const k = a.hw / 16;
  const length = 2.5 + (b.dx + 1) * 1.5;
  const lit = (o: string) => o === 'beard';
  switch (b.variant) {
    case 1: {
      // a pointed beard on the chin and a moustache
      // a tuft on the chin, narrowing to a point
      const low = my + a.mouth.low + 1.1;
      const tuft = smoothPath([[cx - 2.6, low], [cx + 2.6, low], [cx + 1.8, chin + length * 0.4], [cx, chin + length * 0.7], [cx - 1.8, chin + length * 0.4]], 3, true);
      r.poly(tuft, t.main, 'beard');
      r.poly([...tuft.filter(([x]) => x < cx), [cx, low]], t.lit, 'beard', lit);
      break;
    }
    case 2: {
      // a moustache, its ends drawn down past the corners of the mouth
      // only the ends drawn down past the corners of the mouth here; the moustache itself lies over the lip
      for (const side of [-1, 1]) r.poly(smoothPath([[cx + side * (mw - 0.2), my - 0.8], [cx + side * (mw + 1.4), my - 0.2], [cx + side * (mw + 1.6), my + 2.6], [cx + side * (mw + 0.6), my + 2.2]], 3, true), side < 0 ? t.lit : t.main, 'beard');
      break;
    }
    case 3: {
      // a short beard: a strap along the jaw from the ears, over the chin, with a moustache
      const c = a.cheek;
      const outer: Point[] = [[cx + c * 0.99, a.earY], [cx + (c + jaw) / 2 + 0.6, my - 2.5], [cx + jaw + 0.6, my + 2], [cx + (jaw + a.chinW) / 2 + 0.5, chin - 2.6], [cx + a.chinW + 0.6, chin - 0.2], [cx, chin + 1.3]];
      const inner: Point[] = [[cx + c - 2.4, a.earY + 0.6], [cx + (c + jaw) / 2 - 2, my - 2], [cx + jaw - 2.6, my + 1.4], [cx + mw + 0.6, my + 2.4], [cx, my + a.mouth.low + 1.7]];
      const strap = [...mirror(outer, cx), ...outer.slice(0, -1).reverse(), ...inner, ...mirror(inner, cx).slice(0, -1).reverse()];
      r.poly(strap, t.main, 'beard');
      r.poly([...mirror(outer, cx), ...mirror(inner, cx).reverse()], t.lit, 'beard', lit);
      break;
    }
    default: {
      // a full beard: it grows from below the cheekbones, round the mouth and over the chin; the cheeks stay bare
      const c = a.cheek;
      const full = smoothPath([
        [cx - c * 0.97, a.cheekY + 2.2], [cx - c * 0.72, a.cheekY + 3.8], [cx - mw - 1.6, my - 1.6], [cx - 2, nb + 1.1], [cx, nb + 1.5],
        [cx + 2, nb + 1.1], [cx + mw + 1.6, my - 1.6], [cx + c * 0.72, a.cheekY + 3.8], [cx + c * 0.97, a.cheekY + 2.2],
        [cx + jaw + 0.7, my + 2.5], [cx + a.chinW + 2, chin], [cx + 3, chin + length], [cx, chin + length + 0.6], [cx - 3, chin + length],
        [cx - a.chinW - 2, chin], [cx - jaw - 0.7, my + 2.5],
      ], 3, true);
      r.poly(full, t.main, 'beard');
      r.poly([...full.filter(([x]) => x < cx - 2.5), [cx - 2.5, chin + length]], t.lit, 'beard', lit);
      // strands: a few lines of light down the beard
      for (const dx of [-6, -2.5, 2.5]) r.line(cx + dx * k, my + 3, cx + dx * k * 0.8, chin + length - 1, dx < 0 ? t.lit + 1 : t.main + 1, 'beard');
    }
  }
}
