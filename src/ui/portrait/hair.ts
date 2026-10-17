import type { Anatomy } from './anatomy';
import { headShape } from './head';
import { mirror, type Point, type Raster } from './raster';

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
    const fall = (a.female ? shoulders + 8 : chin + 4) + hair.dx * 2;
    const out = hw + (a.female ? 3.5 : 2.5);
    const mass: Point[] = [[cx - out, browY - 2], [cx - out - 0.5, chin], [cx - out + 1, fall], [cx - hw + 4, fall - 1], [cx + hw - 4, fall - 1], [cx + out - 1, fall], [cx + out + 0.5, chin], [cx + out, browY - 2]];
    r.poly(mass, t.main, 'hair');
    r.poly([[cx - out, browY - 2], [cx - out - 0.5, chin], [cx - out + 1, fall], [cx - out + 3.5, fall - 1], [cx - out + 3, browY]], t.lit, 'hair');
    r.poly([[cx + out - 2.5, browY], [cx + out - 1.5, fall - 1], [cx + out - 1, fall], [cx + out + 0.5, chin], [cx + out, browY - 2]], t.deep, 'hair');
  } else if (hair.variant === 4 && !a.female && !a.child) {
    // a queue tied with a dark ribbon, its bow seen beside the neck
    const bx = cx + hw * 0.55;
    const by = chin + 1;
    r.poly([[bx - 4, by - 2], [bx, by], [bx - 4, by + 2]], 1, 'hair');
    r.poly([[bx + 4, by - 2], [bx, by], [bx + 4, by + 2]], 2, 'hair');
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
  const moustache: Point[] = [[cx - mw - 1.2, my + 0.6], [cx - mw, my - 1.2], [cx - 2, nb + 1.2], [cx, nb + 1.6], [cx + 2, nb + 1.2], [cx + mw, my - 1.2], [cx + mw + 1.2, my + 0.6], [cx + mw - 0.5, my], [cx, my - 0.6], [cx - mw + 0.5, my]];
  const lit = (o: string) => o === 'beard';
  switch (b.variant) {
    case 1: {
      // a pointed beard on the chin and a moustache
      r.poly(moustache, t.main, 'beard');
      r.poly([[cx - 3.5, my + 2.4], [cx + 3.5, my + 2.4], [cx + 2, chin + length * 0.8], [cx, chin + length], [cx - 2, chin + length * 0.8]], t.main, 'beard');
      r.poly([[cx - 3.5, my + 2.4], [cx, my + 2.4], [cx, chin + length], [cx - 2, chin + length * 0.8]], t.lit, 'beard', lit);
      break;
    }
    case 2: {
      // a moustache, its ends drawn down past the corners of the mouth
      r.poly([...moustache.slice(0, 7), [cx + mw + 1.8, my + 2.5], [cx + mw + 0.6, my + 2.5], [cx + mw - 0.5, my], [cx, my - 0.6], [cx - mw + 0.5, my], [cx - mw - 0.6, my + 2.5], [cx - mw - 1.8, my + 2.5]], t.main, 'beard');
      r.poly([[cx - mw - 1.2, my + 0.6], [cx - mw, my - 1.2], [cx - 2, nb + 1.2], [cx, nb + 1.6], [cx, my - 0.6], [cx - mw + 0.5, my]], t.lit, 'beard', lit);
      break;
    }
    case 3: {
      // a short beard along the jaw and over the chin, with a moustache
      const shape = headShape(a).filter(([, y]) => y > a.earY);
      r.poly([...shape, [cx - jaw + 2, my + 1], [cx, my + 2.5], [cx + jaw - 2, my + 1]], t.main, 'beard');
      r.poly(moustache, t.main, 'beard');
      r.poly([[cx - a.cheek - 1, a.earY], [cx - jaw + 2, my + 1], [cx - 2, chin + 1], [cx - a.cheek + 1.5, a.earY]], t.lit, 'beard', lit);
      break;
    }
    default: {
      // a full beard from the cheeks to below the chin
      const full: Point[] = [[cx - 13 * k, nb - 1], [cx - 8 * k, my - 1], [cx - 4, my - 1.5], [cx, my - 0.8], [cx + 4, my - 1.5], [cx + 8 * k, my - 1], [cx + 13 * k, nb - 1], [cx + a.cheek - 0.4, nb + 1], [cx + jaw + 0.6, my + 2.5], [cx + 6.5 * k, chin - 0.6], [cx + 3, chin + length], [cx, chin + length + 0.6], [cx - 3, chin + length], [cx - 6.5 * k, chin - 0.6], [cx - jaw - 0.6, my + 2.5], [cx - a.cheek + 0.4, nb + 1]];
      r.poly(full, t.main, 'beard');
      r.poly([[cx - 13 * k, nb - 1], [cx - 8 * k, my - 1], [cx - 4, my - 1.5], [cx - 3, chin + 1], [cx - 3, chin + length], [cx - 6.5 * k, chin - 0.6], [cx - jaw - 0.6, my + 2.5], [cx - a.cheek + 0.4, nb + 1]], t.lit, 'beard', lit);
      r.poly(moustache, t.deep, 'beard');
      // strands: a few lines of light down the beard
      for (const dx of [-6, -2, 3]) r.line(cx + dx * k, my + 3, cx + dx * k * 0.8, chin + length - 1, dx < 0 ? t.lit + 1 : t.main + 1, 'beard');
    }
  }
}
