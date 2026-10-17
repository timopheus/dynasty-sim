import type { Part } from '../../core/looks';
import type { Anatomy } from './anatomy';
import { mirror, turn, type Point, type Raster } from './raster';

/**
 * Clothes, headwear and marks (4.12, D-305), in flat planes: eighteenth-century dress of Europe and the Levant.
 * A hat is drawn to the size of a real hat and may run past the frame.
 */

const FACE = new Set(['head', 'eyes', 'brows', 'nose', 'mouth', 'mole', 'wrinkles', 'illness', 'beard', 'scars']);

export function body(r: Raster, a: Anatomy): void {
  const { cx, shoulders: y0, female } = a;
  const sh = a.shoulderHalf;
  const fall = female ? 11 : a.child ? 9 : 8;
  const outline: Point[] = [[cx - sh, y0 + fall], [cx - sh + 6, y0 + fall * 0.45], [cx - 14, y0 + 0.5], [cx - 6, y0 - 1.5], [cx + 6, y0 - 1.5], [cx + 14, y0 + 0.5], [cx + sh - 6, y0 + fall * 0.45], [cx + sh, y0 + fall], [cx + sh, 81], [cx - sh, 81]];
  const lit: Point[] = [[cx - sh, y0 + fall], [cx - sh + 6, y0 + fall * 0.45], [cx - 14, y0 + 0.5], [cx - 6, y0 - 1.5], [cx - 4, 81], [cx - sh, 81]];
  const edge: Point[] = [[cx - sh, y0 + fall], [cx - sh + 6, y0 + fall * 0.45], [cx - 14, y0 + 0.5], [cx - 12, y0 + 2.5], [cx - sh + 7, y0 + fall * 0.45 + 2.5], [cx - sh + 1, y0 + fall + 3]];
  const attire = a.spec.attire;
  if (female) {
    const dress = [7, 4, 3, 2][attire] ?? 4;
    r.poly(outline, dress, 'attire');
    r.poly(lit, dress + 1, 'attire');
    r.poly(edge, dress + 2, 'attire');
    // the neckline: skin of the chest, lower on a finer dress
    const deep = attire >= 2 ? 7 : 5;
    const neck: Point[] = [[cx - 9, y0 - 1], [cx + 9, y0 - 1], [cx + 7, y0 + deep], [cx - 7, y0 + deep]];
    r.poly(neck, 6, 'neck');
    r.poly([[cx - 9, y0 - 1], [cx - 1, y0 - 1], [cx - 1, y0 + deep], [cx - 7, y0 + deep]], 8, 'neck');
    if (attire === 0) {
      // a shawl over the shoulders, its ends crossed on the chest
      r.poly([[cx - sh + 2, y0 + fall], [cx - 12, y0 + 1], [cx - 7, y0 + 1], [cx + 3, y0 + 12], [cx - 2, y0 + 16]], 5, 'attire');
      r.poly([[cx + sh - 2, y0 + fall], [cx + 12, y0 + 1], [cx + 7, y0 + 1], [cx - 3, y0 + 12], [cx + 2, y0 + 16]], 3, 'attire');
    } else if (attire === 1) {
      // a white kerchief over the shoulders, crossing on the breast
      r.poly([[cx - 16, y0 + 2], [cx - 9, y0 - 1], [cx - 7, y0 + deep], [cx + 2, y0 + deep + 6], [cx - 4, y0 + deep + 7], [cx - 15, y0 + 6]], 10, 'attire');
      r.poly([[cx + 16, y0 + 2], [cx + 9, y0 - 1], [cx + 7, y0 + deep], [cx - 2, y0 + deep + 6], [cx + 4, y0 + deep + 7], [cx + 15, y0 + 6]], 8, 'attire');
    } else {
      // lace along the edge of the neckline
      for (let x = cx - 7; x <= cx + 7; x++) r.set(x, y0 + deep, x % 2 === 0 ? 10 : 9, 'attire');
      r.line(cx - 9, y0 - 1, cx - 7, y0 + deep, 9, 'attire');
      r.line(cx + 9, y0 - 1, cx + 7, y0 + deep, 8, 'attire');
      if (attire >= 3) {
        // a string of pearls
        for (let i = -3; i <= 3; i++) r.set(cx + i * 2, y0 + 1 + Math.round(Math.abs(i) * 0.35 * Math.abs(i) / 2), 10, 'attire');
      }
    }
    return;
  }
  if (attire === 0) {
    // a linen shirt, open at the throat
    r.poly(outline, 7, 'attire');
    r.poly(lit, 8, 'attire');
    r.poly(edge, 9, 'attire');
    r.poly([[cx - 4, y0 - 1.5], [cx + 4, y0 - 1.5], [cx, y0 + 7]], 6, 'neck');
    r.poly([[cx - 4, y0 - 1.5], [cx, y0 - 1.5], [cx, y0 + 7]], 8, 'neck');
    r.line(cx - 5, y0 - 1, cx - 1, y0 + 8, 5, 'attire');
    r.line(cx + 5, y0 - 1, cx + 1, y0 + 8, 4, 'attire');
    r.line(cx - 12, y0 + 6, cx - 9, y0 + 16, 6, 'attire');
    return;
  }
  const coat = [7, 4, 3, 2][attire] ?? 4;
  r.poly(outline, coat - 1, 'attire');
  r.poly(lit, coat, 'attire');
  r.poly(edge, coat + 2, 'attire');
  // the waistcoat in the opening of the coat, the neckcloth at the throat
  r.poly([[cx - 6, y0 - 1.5], [cx + 6, y0 - 1.5], [cx + 7, 81], [cx - 7, 81]], attire >= 2 ? 6 : 5, 'attire');
  r.poly([[cx - 6, y0 - 1.5], [cx, y0 - 1.5], [cx, 81], [cx - 7, 81]], attire >= 2 ? 7 : 6, 'attire');
  for (let y = y0 + 8; y < 80; y += 3) r.set(cx, y, attire >= 2 ? 10 : 3, 'attire');
  r.poly([[cx - 6, y0 - 1.5], [cx + 6, y0 - 1.5], [cx + 3, y0 + 8], [cx, y0 + 10], [cx - 3, y0 + 8]], 8, 'attire');
  r.poly([[cx - 6, y0 - 1.5], [cx, y0 - 1.5], [cx, y0 + 10], [cx - 3, y0 + 8]], 10, 'attire');
  if (attire >= 2) {
    // lapels turned back, their edge braided on the grandest coat
    for (const side of [-1, 1]) {
      const lapel: Point[] = [[cx + side * 6, y0 - 1.5], [cx + side * 11, y0 + 1], [cx + side * 9, y0 + 12], [cx + side * 7, 81]];
      r.poly([...lapel, [cx + side * 6.5, 81], [cx + side * 6, y0 + 4]], side < 0 ? coat + 3 : coat + 1, 'attire');
      r.line(cx + side * 11, y0 + 1, cx + side * 9, y0 + 12, attire >= 3 ? 10 : coat - 1, 'attire');
    }
  }
  if (attire >= 3) {
    // a lace cravat falling over the waistcoat
    r.poly([[cx - 3, y0 + 7], [cx + 3, y0 + 7], [cx + 2.5, y0 + 15], [cx, y0 + 16.5], [cx - 2.5, y0 + 15]], 10, 'attire');
    for (const y of [y0 + 9, y0 + 12, y0 + 15]) r.line(cx - 2, y, cx + 2, y, 8, 'attire');
  }
}

/** Kinds of headwear: the variant and the shift of the head accessory choose one of nine (D-305). */
const MEN = ['tricorn', 'tricorn_cocked', 'tricorn_laced', 'felt_hat', 'wool_cap', 'turban', 'keffiyeh', 'fur_cap', 'wig'] as const;
const WOMEN = ['mob_cap', 'lappet_cap', 'hood', 'straw_hat', 'straw_hat_tilted', 'hijab', 'headscarf', 'turban', 'tricorn'] as const;
export type Headwear = (typeof MEN)[number] | (typeof WOMEN)[number];

export function headwearKind(a: Anatomy, h: Part): Headwear {
  return ((a.female ? WOMEN : MEN)[h.variant * 3 + (h.dx + 1)] ?? (a.female ? 'mob_cap' : 'tricorn')) as Headwear;
}

const notFace = (o: string) => !FACE.has(o);

function tricorn(r: Raster, a: Anatomy, kind: Headwear, seat: number): void {
  const k = (a.hw / 16) * (a.female ? 0.85 : 1);
  const dy = a.top - 9 + seat + (a.female ? 1 : 0);
  const angle = kind === 'tricorn_cocked' ? (a.spec.hair?.dx ?? 0) >= 0 ? 0.14 : -0.14 : 0;
  const at = (pts: Point[]): Point[] => {
    const placed = pts.map(([x, y]): Point => [a.cx + (x - 32) * k, y + dy]);
    return angle ? turn(placed, a.cx, a.top + 8, angle) : placed;
  };
  // the crown behind, two cocked-up panels meeting at the point over the brow, a binding on their edge
  r.poly(at([[7, 6.5], [16, 3.5], [24, 2], [32, 1.5], [40, 2], [48, 3.5], [57, 6.5], [32, 20]]), 2, 'headwear');
  r.poly(at([[16, 4.5], [24, 3], [30, 2.6], [26, 6], [18, 7]]), 3, 'headwear');
  const panel: Point[] = [[7, 6.5], [12, 7], [20, 9.5], [27, 13.5], [32, 18.5], [32, 21.5], [27, 20], [20, 19], [14, 16.5], [8.5, 11.5]];
  r.poly(at(panel), 4, 'headwear');
  r.poly(at(mirror(panel, 32)), 1, 'headwear');
  const binding = kind === 'tricorn_laced' ? [10, 8] : [7, 4];
  const left = at([[8, 6.6], [31.5, 18.8]]);
  const right = at([[56, 6.6], [32.5, 18.8]]);
  r.line(left[0]![0], left[0]![1], left[1]![0], left[1]![1], binding[0]!, 'headwear');
  r.line(right[0]![0], right[0]![1], right[1]![0], right[1]![1], binding[1]!, 'headwear');
  if (kind === 'tricorn_laced') {
    const [c] = at([[18, 12]]);
    r.ellipse(c![0], c![1], 2, 2, 10, 'headwear');
    r.set(Math.floor(c![0]), Math.floor(c![1]), 2, 'headwear');
  }
  // the brim's shadow on the brow
  r.shadow(at([[12, 17], [32, 22], [52, 17], [52, 21], [32, 25], [12, 21]]), -2, (o) => FACE.has(o) || o === 'hair');
}

function headwearShape(r: Raster, a: Anatomy, h: Part): void {
  const kind = headwearKind(a, h);
  const seat = h.dy;
  const { cx, hw, top, hairline, browY, earY, chin, shoulders } = a;
  const k = hw / 16;
  const base = hairline + 1 + seat;
  switch (kind) {
    case 'tricorn':
    case 'tricorn_cocked':
    case 'tricorn_laced':
      tricorn(r, a, kind, seat);
      return;
    case 'felt_hat': {
      // a round crown with a band, a wide brim seen a little from below
      r.ellipse(cx, base - 0.5, 26 * k, 2.8, 2, 'headwear');
      r.ellipse(cx - 6, base - 1.2, 14 * k, 1.2, 3, 'headwear');
      for (let x = Math.floor(cx - 24 * k); x <= cx + 24 * k; x++) r.set(x, Math.round(base + 1.6), 1, 'headwear');
      // a low flat-topped crown, as the round hats of the century were
      const crown: Point[] = [[cx - 12 * k, base - 1], [cx - 12.5 * k, top - 1], [cx - 11 * k, top - 3], [cx + 11 * k, top - 3], [cx + 12.5 * k, top - 1], [cx + 12 * k, base - 1]];
      r.poly(crown, 2, 'headwear');
      r.poly([[cx - 12 * k, base - 1], [cx - 12.5 * k, top - 1], [cx - 11 * k, top - 3], [cx - 4, top - 3], [cx - 6, base - 1]], 3, 'headwear');
      r.poly([[cx - 12 * k, base - 4], [cx + 12 * k, base - 4], [cx + 12 * k, base - 1.5], [cx - 12 * k, base - 1.5]], 1, 'headwear');
      r.shadow([[cx - 16, base + 1.5], [cx + 16, base + 1.5], [cx + 15, base + 5], [cx - 15, base + 5]], -2, (o) => FACE.has(o) || o === 'hair');
      return;
    }
    case 'wool_cap': {
      // a soft knitted cap, its top falling to one side, a rolled band
      const shape: Point[] = [[cx - hw - 1.5, base], [cx - hw - 1, top + 1], [cx - 7, top - 5], [cx + 5, top - 6], [cx + 14 * k, top - 3.5], [cx + hw + 2.5, top + 2], [cx + hw + 1.5, base]];
      r.poly(shape, 4, 'headwear');
      r.poly([[cx - hw - 1.5, base], [cx - hw - 1, top + 1], [cx - 7, top - 5], [cx - 2, top - 5.5], [cx - hw + 3, base]], 5, 'headwear');
      r.poly([[cx - hw - 1.6, base - 3.5], [cx + hw + 1.6, base - 3.5], [cx + hw + 1.6, base + 0.5], [cx - hw - 1.6, base + 0.5]], 3, 'headwear');
      for (let x = Math.ceil(cx - hw); x < cx + hw; x += 3) r.line(x, top + 1, x, base - 4, 3, 'headwear');
      r.line(cx - hw - 1, Math.round(base - 3.5), cx + hw + 1, Math.round(base - 3.5), 5, 'headwear');
      return;
    }
    case 'turban': {
      // cloth wound round the head: a full rounded mass with its folds running across it
      const s = a.female ? 0.85 : 1;
      const dome: Point[] = [[cx - (hw + 4) * s, base + 1], [cx - (hw + 4.5) * s, top + 1], [cx - 9 * s, top - 7 * s], [cx + 9 * s, top - 7 * s], [cx + (hw + 4.5) * s, top + 1], [cx + (hw + 4) * s, base + 1], [cx, base + 2.5]];
      r.poly(dome, 8, 'headwear');
      r.poly([[cx - (hw + 4) * s, base + 1], [cx - (hw + 4.5) * s, top + 1], [cx - 9 * s, top - 7 * s], [cx - 3, top - 7 * s], [cx - hw * 0.6, base + 2]], 9, 'headwear');
      r.poly([[cx + hw * 0.5, top - 4], [cx + 9 * s, top - 7 * s], [cx + (hw + 4.5) * s, top + 1], [cx + (hw + 4) * s, base + 1], [cx + hw * 0.6, base + 2]], 6, 'headwear');
      for (let i = 0; i < 5; i++) {
        const y = base - 1 - i * 3;
        r.line(cx - (hw + 3) * s, y + 1, cx + (hw + 3) * s, y - 3, (x, yy) => (r.ownerAt(x, yy) === 'headwear' ? (x < cx ? 7 : 5) : null), 'headwear');
      }
      if (a.spec.attire >= 3) r.ellipse(cx, base - 3, 1.5, 1.8, 10, 'jewel');
      return;
    }
    case 'keffiyeh':
    case 'hood':
    case 'hijab': {
      // cloth over the head falling to the shoulders, open round the face
      const tone = kind === 'keffiyeh' ? 9 : kind === 'hood' ? 4 : 5;
      const reach = kind === 'hijab' ? shoulders + 10 : kind === 'hood' ? shoulders + 8 : shoulders + 10;
      const w = hw + (kind === 'hood' ? 4.5 : 3.5);
      const cloth: Point[] = [[cx - w - 1, chin], [cx - w, top + 4], [cx - 10, top - 3.5], [cx + 10, top - 3.5], [cx + w, top + 4], [cx + w + 1, chin], [cx + w + 6, reach], [cx - w - 6, reach]];
      const openTop = kind === 'hijab' ? browY - 3 : hairline + 1;
      const openSide = kind === 'hijab' ? hw - 2.5 : hw - 1;
      const face = (o: string, x: number, y: number) => {
        if (y < openTop) return true;
        if (kind === 'hijab' && y > chin - 1) return true;
        return !(FACE.has(o) || o === 'neck' || o === 'ears' || o === 'attire') || Math.abs(x + 0.5 - cx) > openSide + (y > chin ? 4 : 0);
      };
      r.poly(cloth, tone, 'headwear', face);
      r.poly([[cx - w - 1, chin], [cx - w, top + 4], [cx - 10, top - 3.5], [cx - 4, top - 3.5], [cx - w + 3, chin], [cx - w - 2, reach]], tone + 1, 'headwear', (o, x, y) => o === 'headwear' && face(o, x, y));
      r.poly([[cx + w - 3, top + 6], [cx + w, top + 4], [cx + w + 1, chin], [cx + w + 6, reach], [cx + w + 1, reach]], tone - 2, 'headwear', (o) => o === 'headwear');
      if (kind === 'keffiyeh') {
        // the agal: a dark double cord round the crown
        for (const y of [top + 2, top + 4]) r.line(cx - hw - 2, y + 1, cx + hw + 2, y + 1, (x) => (x < cx ? 2 : 1), 'headwear');
      }
      if (kind === 'hijab') {
        // the cloth closes under the chin
        r.poly([[cx - hw + 1, chin - 4], [cx + hw - 1, chin - 4], [cx + hw + 2, chin + 6], [cx - hw - 2, chin + 6]], tone, 'headwear', (o) => !FACE.has(o) || o === 'beard');
        r.poly([[cx - hw + 1, chin - 4], [cx, chin - 4], [cx, chin + 6], [cx - hw - 2, chin + 6]], tone + 1, 'headwear', (o) => o === 'headwear');
      }
      return;
    }
    case 'fur_cap': {
      const cap: Point[] = [[cx - hw - 2, base], [cx - hw - 2, top - 3], [cx - hw, top - 6.5], [cx + hw, top - 6.5], [cx + hw + 2, top - 3], [cx + hw + 2, base]];
      r.poly(cap, 4, 'headwear');
      r.poly([[cx - hw - 2, base], [cx - hw - 2, top - 3], [cx - hw, top - 6.5], [cx - 4, top - 6.5], [cx - 6, base]], 6, 'headwear');
      // tufts of fur
      for (let i = 0; i < 26; i++) {
        const x = cx - hw - 1 + ((i * 7) % (2 * hw + 2));
        const y = top - 5 + ((i * 5) % (base - top + 3));
        r.line(x, y, x + 1, y + 1, x < cx - 3 ? 8 : 2, 'headwear');
      }
      return;
    }
    case 'wig': {
      // a powdered wig: smooth over the crown with a high forehead, two rolled curls over each ear
      const crown: Point[] = [[cx - hw - 2.5, earY - 4], [cx - hw - 2, top + 3], [cx - 9, top - 2.5], [cx + 9, top - 2.5], [cx + hw + 2, top + 3], [cx + hw + 2.5, earY - 4], [cx + hw - 1, hairline + 1], [cx + 5, hairline - 1.5], [cx - 5, hairline - 1.5], [cx - hw + 1, hairline + 1]];
      r.poly(crown, 9, 'headwear');
      r.poly([[cx - hw - 2.5, earY - 4], [cx - hw - 2, top + 3], [cx - 9, top - 2.5], [cx - 3, top - 2.5], [cx - hw + 1, hairline + 1]], 10, 'headwear');
      r.poly([[cx + hw - 2, top + 5], [cx + hw + 2, top + 3], [cx + hw + 2.5, earY - 4], [cx + hw - 1, hairline + 1]], 7, 'headwear');
      for (const side of [-1, 1]) {
        for (const y of [earY - 2.5, earY + 1]) {
          const x = cx + side * (hw + 0.5);
          r.ellipse(x, y, 3.4, 1.7, side < 0 ? 9 : 7, 'headwear');
          r.line(x - 3, y + 1.4, x + 3, y + 1.4, side < 0 ? 6 : 4, 'headwear');
          r.line(x - 2, y - 1.2, x + 1, y - 1.2, side < 0 ? 10 : 8, 'headwear');
        }
      }
      return;
    }
    case 'mob_cap': {
      // a puffed linen cap, a ribbon round it and a frill along the brow
      const cap: Point[] = [[cx - hw - 4, base + 1], [cx - hw - 3.5, top - 1], [cx - 7, top - 6], [cx + 7, top - 6], [cx + hw + 3.5, top - 1], [cx + hw + 4, base + 1]];
      r.poly(cap, 9, 'headwear');
      r.poly([[cx - hw - 4, base + 1], [cx - hw - 3.5, top - 1], [cx - 7, top - 6], [cx - 1, top - 6], [cx - 5, base]], 10, 'headwear');
      r.poly([[cx + hw - 1, top + 1], [cx + hw + 3.5, top - 1], [cx + hw + 4, base + 1], [cx + hw - 1, base + 1]], 7, 'headwear');
      r.line(cx - hw - 3.5, base - 2, cx + hw + 3.5, base - 2, 3, 'headwear');
      for (let x = Math.ceil(cx - hw - 3.5); x < cx + hw + 3.5; x++) r.set(x, base + 1 + (x % 2), x < cx ? 10 : 8, 'headwear');
      return;
    }
    case 'lappet_cap': {
      // a small lace cap on the crown and lace strips hanging beside the face
      r.ellipse(cx, top + 2, 9 * k, 4.2, 10, 'headwear');
      r.ellipse(cx + 3, top + 3, 5 * k, 2.5, 8, 'headwear');
      for (const side of [-1, 1]) {
        const x = cx + side * (hw + 1);
        r.poly([[x - 1.5, top + 4], [x + 1.5, top + 4], [x + 1.5, earY + 7], [x - 1.5, earY + 7]], side < 0 ? 10 : 8, 'headwear');
        for (let y = Math.ceil(top + 5); y < earY + 7; y += 2) r.set(Math.round(x + side * 1.5), y, side < 0 ? 8 : 6, 'headwear');
      }
      return;
    }
    case 'straw_hat':
    case 'straw_hat_tilted': {
      const angle = kind === 'straw_hat_tilted' ? -0.14 : 0;
      const t2 = (pts: Point[]): Point[] => (angle ? turn(pts, cx, base, angle) : pts);
      const brim: Point[] = [];
      for (let i = 0; i < 24; i++) {
        const u = (i / 24) * Math.PI * 2;
        brim.push([cx + Math.cos(u) * 27 * k, base + Math.sin(u) * 3]);
      }
      r.poly(t2(brim), 9, 'headwear');
      r.poly(t2(brim.filter(([, y]) => y >= base).concat([[cx - 27 * k, base]])), 6, 'headwear');
      r.poly(t2([[cx - 10 * k, base - 0.5], [cx - 10 * k, top - 3], [cx + 10 * k, top - 3], [cx + 10 * k, base - 0.5]]), 8, 'headwear');
      r.poly(t2([[cx - 10 * k, base - 0.5], [cx - 10 * k, top - 3], [cx - 3, top - 3], [cx - 4, base - 0.5]]), 9, 'headwear');
      r.poly(t2([[cx - 10 * k, base - 3.5], [cx + 10 * k, base - 3.5], [cx + 10 * k, base - 1], [cx - 10 * k, base - 1]]), 3, 'headwear');
      r.shadow(t2([[cx - 17, base + 3], [cx + 17, base + 3], [cx + 16, base + 6], [cx - 16, base + 6]]), -2, (o) => FACE.has(o) || o === 'hair');
      return;
    }
    case 'headscarf': {
      // a kerchief over the hair, knotted at the nape
      const scarf: Point[] = [[cx - hw - 2.5, earY + 1], [cx - hw - 2, top + 2], [cx - 8, top - 3], [cx + 8, top - 3], [cx + hw + 2, top + 2], [cx + hw + 2.5, earY + 1], [cx + hw - 1, hairline + 4], [cx + 4, hairline + 0.5], [cx - 4, hairline + 0.5], [cx - hw + 1, hairline + 4]];
      r.poly(scarf, 6, 'headwear');
      r.poly([[cx - hw - 2.5, earY + 1], [cx - hw - 2, top + 2], [cx - 8, top - 3], [cx - 2, top - 3], [cx - hw + 1, hairline + 4]], 7, 'headwear');
      r.ellipse(cx + hw + 2, earY + 3, 2, 1.6, 4, 'headwear');
      r.poly([[cx + hw + 1, earY + 4], [cx + hw + 4, earY + 9], [cx + hw + 2, earY + 9]], 4, 'headwear');
      for (let i = 0; i < 4; i++) r.line(cx - hw + i * 8, top + 1 + i, cx - hw + 4 + i * 8, hairline - 1, 5, 'headwear');
      return;
    }
  }
}

export function headwear(r: Raster, a: Anatomy): void {
  const h = a.spec.accessories.find((p) => p.slot === 'head');
  if (h) headwearShape(r, a, h);
}

export function jewel(r: Raster, a: Anatomy): void {
  const j = a.spec.accessories.find((p) => p.slot === 'ear');
  if (!j) return;
  if (a.female) {
    for (const side of [-1, 1]) {
      const x = Math.round(a.cx + side * (a.hw + 1.5)) - (side < 0 ? 1 : 0);
      const y = Math.round(a.earY + 5);
      if (j.variant === 0) r.sprite(['2', 'a', '9'], x, y, 'jewel');
      else if (j.variant === 1) r.sprite(['a'], x, y, 'jewel');
      else r.sprite(['.9.', '9.9', '.9.'], x - 1, y, 'jewel');
    }
    return;
  }
  // a man wears his jewel as a pin or an order on the coat
  const x = a.cx - 11 + j.dx;
  const y = a.shoulders + 8 + j.dy;
  const sprite = [['.a.', 'a2a', '.a.'], ['a.a', '.a.', 'a.a'], ['a', '9', '9']][j.variant] ?? ['a'];
  r.sprite(sprite, x, y, 'jewel');
}

/** A scar: a pale seam with stitch marks across it, in each person's own place (D-301). */
export function scars(r: Raster, a: Anatomy): void {
  a.spec.scars.forEach((s, n) => {
    const m = n === 1 ? -1 : 1;
    const ox = a.cx + s.dx * 1.4;
    const oy = s.dy * 1.2;
    let seg: [number, number, number, number];
    switch (s.variant) {
      case 1:
        seg = [ox + m * (a.eyeOff + 1), a.browY - 3 + oy, ox + m * (a.eyeOff + 2.5), a.eyeY + 5 + oy];
        break;
      case 2:
        seg = [ox + m * 1, a.mouthY - 4 + oy, ox + m * 3.5, a.chin - 1.5 + oy];
        break;
      case 3:
        seg = [ox - m * a.hw * 0.45, a.browY - 6 + oy, ox + m * a.hw * 0.25, a.browY - 2 + oy];
        break;
      default:
        seg = [ox - m * a.hw * 0.75, a.eyeY + 2 + oy, ox - m * a.hw * 0.3, a.eyeY + 9 + oy];
    }
    const [x0, y0, x1, y1] = seg;
    const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    r.line(x0, y0, x1, y1, (x, y, i) => {
      // stitches across the seam every third pixel
      if (i % 3 === 1) {
        if (steep) {
          r.set(x - 1, y, 2, 'scars');
          r.set(x + 1, y, 2, 'scars');
        } else {
          r.set(x, y - 1, 2, 'scars');
          r.set(x, y + 1, 2, 'scars');
        }
      }
      return r.ownerAt(x, y) === 'beard' || r.ownerAt(x, y) === 'hair' ? 7 : x < a.cx ? 11 : 8;
    }, 'scars');
  });
}

export function bandages(r: Raster, a: Anatomy): void {
  const { cx, hw, browY, eyeY, chin, top } = a;
  for (const b of a.spec.bandages) {
    switch (b.variant) {
      case 1: {
        // a plaster on the cheek: two crossed strips
        const x = cx + hw * 0.45 + b.dx;
        const y = eyeY + 5 + b.dy;
        r.poly([[x - 3, y - 2.5], [x - 2, y - 3.2], [x + 3, y + 2.5], [x + 2, y + 3.2]], 9, 'bandages');
        r.poly([[x - 3, y + 2.5], [x - 2, y + 3.2], [x + 3, y - 2.5], [x + 2, y - 3.2]], 8, 'bandages');
        break;
      }
      case 2: {
        // cloth tied under the jaw and over the head
        for (const side of [-1, 1]) r.poly([[cx + side * (hw - 3), top + 3], [cx + side * (hw + 0.5), top + 3], [cx + side * (hw - 2), chin - 2], [cx + side * (hw - 5), chin - 2]], side < 0 ? 10 : 8, 'bandages');
        r.poly([[cx - hw + 3, chin - 3], [cx + hw - 3, chin - 3], [cx + 5, chin + 2.5], [cx - 5, chin + 2.5]], 9, 'bandages');
        r.ellipse(cx - 1.5, top + 0.5, 1.8, 1.4, 10, 'bandages');
        r.ellipse(cx + 1.5, top + 0.5, 1.8, 1.4, 8, 'bandages');
        break;
      }
      default: {
        // a band round the head with a knot over one ear
        const y = browY - 6.5 + b.dy;
        r.poly([[cx - hw - 1, y], [cx + hw + 1, y], [cx + hw + 1, y + 3.5], [cx - hw - 1, y + 3.5]], 10, 'bandages', (o) => o !== 'background' && o !== 'attire');
        r.poly([[cx, y], [cx + hw + 1, y], [cx + hw + 1, y + 3.5], [cx, y + 3.5]], 8, 'bandages', (o) => o === 'bandages');
        r.line(cx - hw, Math.round(y + 3), cx + hw, Math.round(y + 3), (x) => (x < cx ? 8 : 6), 'bandages');
        r.ellipse(cx + hw + 1.5, y + 1.5, 1.8, 1.5, 8, 'bandages');
        r.poly([[cx + hw + 1, y + 2], [cx + hw + 4, y + 7], [cx + hw + 2.5, y + 7.5]], 7, 'bandages');
      }
    }
  }
}

export function eyepatch(r: Raster, a: Anatomy): void {
  const side = a.spec.eyepatch === 'left' ? -1 : a.spec.eyepatch === 'right' ? 1 : 0;
  if (!side) return;
  const x = a.cx + side * a.eyeOff;
  const y = a.eyeY;
  // the strap: to the near temple and across the forehead to the far side
  r.line(x + side * 3, y - 1, a.cx + side * (a.hw + 1), y - 3, 1, 'eyepatch');
  r.line(x - side * 3, y - 2, a.cx - side * (a.hw - 1), a.top + 7, 1, 'eyepatch');
  r.ellipse(x, y - 0.5, 4.2, 3.3, 1, 'eyepatch');
  r.set(Math.round(x) - 2, Math.round(y) - 2, 3, 'eyepatch');
  r.set(Math.round(x) - 1, Math.round(y) - 2, 2, 'eyepatch');
}
