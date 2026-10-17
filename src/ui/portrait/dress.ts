import type { Part } from '../../core/looks';
import { headHalf, type Geometry } from './geometry';
import { clamp, gauss, inEllipse, lambert, rotate, segDist, smooth, type Sample } from './shape';

/**
 * Clothes, hats and marks (4.12, D-305): eighteenth-century dress of Europe and the Levant. A man wears a shirt, a
 * coat and a neckcloth; a woman a bodice with a kerchief or a lace edge. Shoulders follow sex and age.
 */

/** Height of the shoulder line at x: down from the neck, round over the shoulder. */
function shoulderLine(g: Geometry, x: number): number {
  const a = Math.abs(x - g.cx);
  const start = g.neckHalf + 0.5;
  let y = g.shoulders + Math.max(0, a - start) * g.slope + 0.6 * smooth(0, start, a);
  const edge = g.shoulderHalf - 4;
  if (a > edge) y += ((a - edge) / 4) ** 2 * 4.5;
  return y;
}

export function body(g: Geometry, c: Sample, x: number, y: number): void {
  const a = Math.abs(x - g.cx);
  if (a > g.shoulderHalf + Math.max(0, y - g.shoulders) * 0.12 || y < shoulderLine(g, x)) return;
  const spec = g.spec;
  const dx = (x - g.cx) / g.shoulderHalf;
  const lit = lambert(clamp(dx * 0.9, -1, 1), clamp((g.shoulders + 4 - y) / 10, -0.6, 0.6));
  const folds = 0.05 * smooth(0.5, 1, Math.cos((x - g.cx) * 0.5 + y * 0.15));
  const cloth = (base: number) => base - 0.12 + 0.3 * lit - folds;
  const st = g.shoulders;
  if (g.female) {
    const dress = [0.62, 0.36, 0.3, 0.22][spec.attire] ?? 0.36;
    c.put(1, cloth(dress), 'attire');
    // the neckline: skin of the chest above a curved or square edge
    const neckline = st + (spec.attire >= 2 ? 6.5 : 4.5) + 0.06 * a * a * (spec.attire >= 2 ? 0.25 : 0.5);
    const open = a < (spec.attire >= 2 ? 9 : 7);
    if (open && y < neckline) c.put(1, 0.14 + 0.66 * lambert(clamp(dx * 1.6, -1, 1), -0.2) - 0.18 * smooth(st + 2, st, y) * 0, 'neck');
    if (spec.attire === 0) {
      // a shawl over the shoulders, its ends knotted on the chest
      const shawl = a > 6 && y < st + 6 + (a - 6) * 0.35;
      const knot = inEllipse(x, y, g.cx, st + 9, 2, 1.6);
      if (shawl || knot) c.put(1, cloth(0.42) + 0.04 * Math.cos(x * 1.1 + y), 'attire');
    } else if (spec.attire === 1) {
      // a white kerchief crossing on the breast
      const kerchief = (a > 5.5 && y < st + 4 + (a - 5) * 0.25) || (y >= neckline - 1 && y < st + 11 - a * 0.35 && a < 8);
      if (kerchief) c.put(1, cloth(0.86), 'attire');
    } else {
      // lace on the edge of the neckline
      if (open && Math.abs(y - neckline) < 0.9) c.put(1, 0.84 + 0.08 * Math.cos(x * 2.4), 'attire');
      if (spec.attire >= 3) {
        // a string of pearls
        for (let i = -4; i <= 4; i++) {
          const px = g.cx + i * 1.5;
          const py = st + 2 + 0.12 * i * i;
          if (Math.hypot(x - px, y - py) < 0.7) c.put(1, Math.hypot(x - px + 0.25, y - py + 0.25) < 0.3 ? 1 : 0.76, 'attire');
        }
      }
    }
    return;
  }
  // a man: the shirt at the throat, a coat over it
  if (spec.attire === 0) {
    c.put(1, cloth(0.72), 'attire');
    const v = 4.2 - (y - st) * 0.55;
    if (a < v && y < st + 7) c.put(1, 0.16 + 0.62 * lambert(clamp(dx * 2, -1, 1), -0.1), 'neck');
    if (Math.abs(a - v) < 0.5 && y < st + 7.5) c.put(1, 0.4, 'attire');
    // a rough waistcoat, open
    if (a > 5 && a < 11 && y > st + 3) c.put(1, cloth(0.38), 'attire');
    return;
  }
  const coat = [0.7, 0.4, 0.3, 0.22][spec.attire] ?? 0.4;
  c.put(1, cloth(coat), 'attire');
  // the waistcoat in the opening of the coat
  const opening = 2.2 + (y - st) * 0.22;
  if (a < opening && y > st + 2) {
    c.put(1, cloth(spec.attire >= 2 ? 0.58 : 0.5), 'attire');
    if (Math.abs(x - g.cx) < 0.6 && ((y - st) % 2.5) < 0.9) c.put(1, spec.attire >= 2 ? 0.88 : 0.3, 'attire');
  }
  // the edge of the coat: braided on the grandest
  if (Math.abs(a - opening) < 0.55 && y > st + 2) c.put(1, spec.attire >= 3 ? 0.84 : 0.16, 'attire');
  if (spec.attire >= 2 && a > opening && a < opening + 2.2 && y > st + 2 && y < st + 9) c.put(1, cloth(coat + 0.1), 'attire');
  // the neckcloth wound round the throat, and the lace falling from it on the grandest
  if (y > st - 2.5 && y < st + 2 && a < g.neckHalf + 0.6) c.put(1, 0.78 + 0.12 * lambert(clamp(dx * 3, -1, 1), 0) - 0.08 * smooth(0.5, 1, Math.cos(y * 2.4)), 'attire');
  if (spec.attire >= 3 && y >= st + 1.5 && y < st + 10 && a < 2.4 - (y - st) * 0.05) c.put(1, 0.9 - 0.15 * smooth(0.4, 1, Math.cos(y * 1.6 + a * 1.2)), 'attire');
}

/** A hat sits on the skull; its shadow falls on the brow. Kinds of headwear from the variant and the shift (D-305). */
const MEN = ['tricorn', 'tricorn_cocked', 'tricorn_laced', 'felt_hat', 'wool_cap', 'turban', 'keffiyeh', 'fur_cap', 'wig'] as const;
const WOMEN = ['mob_cap', 'lappet_cap', 'hood', 'straw_hat', 'straw_hat_tilted', 'hijab', 'headscarf', 'turban', 'tricorn'] as const;
export type Headwear = (typeof MEN)[number] | (typeof WOMEN)[number];

export function headwearKind(g: Geometry, a: Part): Headwear {
  const i = a.variant * 3 + (a.dx + 1);
  return ((g.female ? WOMEN : MEN)[i] ?? (g.female ? 'mob_cap' : 'tricorn')) as Headwear;
}

/** Felt and cloth lit from the upper left. */
function felt(base: number, x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  return base + 0.28 * lambert(clamp((x - cx) / rx, -1, 1) * 0.9, clamp((y - cy) / ry, -1, 1) * 0.9) - 0.1;
}

/** Darkens the brow under a brim. */
function brimShadow(c: Sample, y: number, edge: number, depth = 0.22): void {
  if (y > edge && y < edge + 2.6 && (c.owner === 'head' || c.owner === 'hair' || c.owner === 'brows' || c.owner === 'eyes')) c.tone -= depth * (1 - (y - edge) / 2.6);
}

function tricorn(g: Geometry, c: Sample, x0: number, y0: number, kind: Headwear, seat: number): void {
  const tilt = kind === 'tricorn_cocked' ? 0.16 : 0;
  const scale = g.female ? 0.85 : 1;
  const [x, y] = tilt ? rotate(x0, y0, g.cx, g.hairline, tilt) : [x0, y0];
  const cx = g.cx + (tilt ? 1.2 : 0);
  const base = g.hairline - 0.6 + seat;
  const half = (g.rx + 3.6) * scale;
  const ad = Math.abs(x - cx);
  if (ad > half) return;
  const r = ad / half;
  // the front corner hangs over the brow; the side corners rise level with the crown
  const point = base + 2.4;
  const corner = g.top - 2.2 + seat;
  const edge = point - (point - corner) * r ** 0.45;
  const skull = headHalf(g, base);
  const lower = ad <= skull ? base + 0.6 * (ad / skull) ** 2 : base + 0.6 - ((ad - skull) / (half - skull)) ** 0.6 * (base + 0.6 - corner);
  const crownTop = g.top - 6.2 + seat;
  const crown = ad < g.rx * 0.95 && y > crownTop + 3 * (ad / (g.rx * 0.95)) ** 2 && y < edge + 0.5;
  const panel = y >= edge && y <= Math.max(lower, edge);
  const tip = y >= base && y <= point && ad < (point - y) * 0.9 + 0.3;
  if (!crown && !panel && !tip) {
    brimShadow(c, y, lower);
    return;
  }
  if (crown && !panel && !tip) {
    c.put(1, felt(0.16, x, y, cx, crownTop + 3, g.rx, 4), 'headwear');
    return;
  }
  // two front panels of the cocked-up brim: the lit one and the one turned from the light; a binding on the edge
  const lit = x < cx ? 0.3 : 0.16;
  const binding = y - edge < 0.75;
  const lace = kind === 'tricorn_laced';
  c.put(1, binding ? (lace ? 0.86 : 0.36) : lit + 0.05 * Math.cos(r * 9), 'headwear');
  if (lace && inEllipse(x, y, cx - half * 0.55, edge + 2, 1.3, 1.3)) c.put(1, Math.hypot(x - (cx - half * 0.55), y - edge - 2) < 0.6 ? 0.2 : 0.8, 'headwear');
}

function headwearShape(g: Geometry, c: Sample, x: number, y: number, a: Part): void {
  const kind = headwearKind(g, a);
  const seat = a.dy * 0.8;
  const cx = g.cx;
  const ad = Math.abs(x - cx);
  const base = g.hairline - 0.5 + seat;
  switch (kind) {
    case 'tricorn':
    case 'tricorn_cocked':
    case 'tricorn_laced':
      tricorn(g, c, x, y, kind, seat);
      return;
    case 'felt_hat': {
      // a round crown and a wide brim seen a little from below
      const crown = ad < g.rx * 0.82 && y > g.top - 5.5 + seat + 1.2 * (ad / g.rx) ** 4 && y < base;
      const brim = inEllipse(x, y, cx, base, g.rx + 6.5, 1.8);
      if (crown) c.put(1, y > base - 2.2 ? 0.34 : felt(0.18, x, y, cx, g.top, g.rx, 5), 'headwear');
      else if (brim) c.put(1, y > base ? 0.1 + 0.08 * lambert((x - cx) / (g.rx + 6), 0) : felt(0.22, x, y, cx, base, g.rx + 6, 2), 'headwear');
      else brimShadow(c, y, base + 1.8, 0.3);
      return;
    }
    case 'wool_cap': {
      // a soft knitted cap, its top falling to one side, a rolled band
      const lean = (y < g.top + 2 ? (g.top + 2 - y) * 0.5 : 0);
      const inside = inEllipse(x - lean, y, cx, base - 1, g.rx + 1.4, g.ry * 0.62) && y < base + 0.6;
      if (!inside) {
        brimShadow(c, y, base + 0.6, 0.15);
        return;
      }
      const band = y > base - 2.4;
      c.put(1, felt(band ? 0.36 : 0.3, x, y, cx, base - 4, g.rx, 6) + 0.04 * Math.cos(x * (band ? 3 : 2.2)), 'headwear');
      return;
    }
    case 'turban': {
      // cloth wound round the head: a full rounded mass with folds running across it
      const inside = inEllipse(x, y, cx, g.top + 1.5 + seat, g.rx + 3.4, g.ry * 0.55) && y < base + 1 - 0.8 * (1 - (ad / g.rx) ** 2);
      if (!inside) {
        brimShadow(c, y, base + 0.5, 0.15);
        return;
      }
      const wind = 0.07 * Math.cos((x - cx) * 0.7 + (y - g.top) * 1.5 + (x > cx ? 1.2 : 0));
      c.put(1, felt(0.68, x, y, cx, g.top, g.rx + 3, g.ry * 0.5) + wind, 'headwear');
      if (g.spec.attire >= 3 && inEllipse(x, y, cx, base - 2.5, 1.2, 1.5)) c.put(1, 0.95, 'jewel');
      return;
    }
    case 'keffiyeh': {
      // a cloth over the head falling to the shoulders, held by a dark double cord
      const face = inEllipse(x, y, cx, g.cy + 2.6, g.rx - 1, g.ry - 1.2) && y > base - 0.6;
      const head = inEllipse(x, y, cx, g.cy - 0.5, g.rx + 3, g.ry + 2.4);
      const falls = y > g.cy && y < g.shoulders + 10 && ad > g.rx - 2 - (y - g.cy) * 0.1 && ad < g.rx + 3 + (y - g.cy) * 0.35;
      if ((!head && !falls) || face) return;
      const cord = Math.abs(y - (g.top + 3.4 + seat + 1.2 * (ad / g.rx) ** 2)) < 0.7 || Math.abs(y - (g.top + 5.2 + seat + 1.2 * (ad / g.rx) ** 2)) < 0.6;
      if (cord && head && ad < g.rx + 2.6) {
        c.put(1, 0.08 + 0.1 * lambert((x - cx) / g.rx, -0.5), 'headwear');
        return;
      }
      const fold = 0.06 * smooth(0.6, 1, Math.cos((x - cx) * (y > g.cy ? 1.3 : 0.9)));
      c.put(1, felt(0.76, x, y, cx, g.cy, g.rx + 4, g.ry + 4) - fold, 'headwear');
      return;
    }
    case 'fur_cap': {
      const half = g.rx + 1.2;
      const inside = ad < half && y > g.top - 5 + seat + (ad > half - 2 ? (ad - half + 2) * 1.2 : 0) && y < base + 0.5;
      if (!inside) {
        brimShadow(c, y, base + 0.5);
        return;
      }
      const tufts = 0.09 * Math.cos(x * 2.1 + Math.sin(y * 1.6) * 2) * Math.cos(y * 2);
      c.put(1, felt(0.34, x, y, cx, g.top - 2, half, 5) + tufts, 'headwear');
      return;
    }
    case 'wig': {
      // a powdered wig: full over the crown and down the temples, rolled curls over the ears
      const skullAt = headHalf(g, y, 2.2);
      const crown = ad < skullAt && y < g.hairline - 0.5 + 1.5 * (ad / g.rx) ** 2;
      const sides = ad < skullAt && ad > headHalf(g, y) - 2.2 && y < g.earY - 3.5;
      let roll = -1;
      for (const ry of [g.earY - 2.4, g.earY + 0.6]) {
        const skull = headHalf(g, ry);
        if (Math.abs(y - ry) < 1.4 && ad > skull - 1.8 && ad < skull + 2.6 - Math.abs(y - ry) * 0.6) roll = ry;
      }
      if (roll >= 0) {
        // each curl a lit cylinder: light on top, a dark seam beneath
        const v = (y - roll) / 1.4;
        c.put(1, 0.9 - 0.32 * smooth(-0.4, 1, v) + 0.06 * (x < cx ? 1 : -1), 'headwear');
      } else if (crown || sides) {
        c.put(1, felt(0.86, x, y, cx, g.top, g.rx + 2, g.ry * 0.7) + 0.05 * Math.cos(Math.atan2(y - g.top, x - cx) * 40), 'headwear');
      }
      return;
    }
    case 'mob_cap': {
      // a puffed linen cap with a frill along the brow and a ribbon round it
      const frill = g.hairline + 0.6 + seat + 0.5 * Math.cos(x * 2);
      const inside = inEllipse(x, y, cx, g.top + 2 + seat, g.rx + 2.8, g.ry * 0.62) && y < frill;
      if (!inside) {
        brimShadow(c, y, frill, 0.1);
        return;
      }
      const ribbon = Math.abs(y - (g.hairline - 2 + seat)) < 0.7;
      c.put(1, ribbon ? 0.3 : felt(0.84, x, y, cx, g.top, g.rx + 2, 6) + 0.05 * Math.cos(x * 1.4 + y * 0.8), 'headwear');
      return;
    }
    case 'lappet_cap': {
      // a small lace cap on the crown and lace strips hanging beside the face
      const cap = inEllipse(x, y, cx, g.top + 1 + seat, g.rx * 0.8, 3.8);
      const strip = y > g.top + 2 && y < g.earY + 5 && Math.abs(ad - (headHalf(g, y) + 0.6)) < 1.2;
      if (cap || strip) c.put(1, felt(0.84, x, y, cx, g.top, g.rx, g.ry), 'headwear');
      return;
    }
    case 'hood': {
      const outer = inEllipse(x, y, cx, g.cy - 0.5, g.rx + 4, g.ry + 3.6) || (y > g.cy && y < g.shoulders + 6 && ad < g.rx + 4 + (y - g.cy) * 0.3);
      const face = inEllipse(x, y, cx, g.cy + 2.4, g.rx - 0.6, g.ry - 1) && y > g.hairline - 1.6;
      if (!outer || face) return;
      const rim = 0.2 * smooth(g.rx - 0.6, g.rx + 1.2, Math.hypot(x - cx, (y - g.cy - 2.4) * (g.rx / g.ry)));
      c.put(1, felt(0.5, x, y, cx, g.cy, g.rx + 4, g.ry + 4) - 0.06 * smooth(0.5, 1, Math.cos(Math.atan2(y - g.cy, x - cx) * 8)) - (0.2 - rim), 'headwear');
      return;
    }
    case 'straw_hat':
    case 'straw_hat_tilted': {
      const tilt = kind === 'straw_hat_tilted' ? -0.14 : 0;
      const [rx, ry] = tilt ? rotate(x, y, cx, base, tilt) : [x, y];
      const rad = Math.abs(rx - cx);
      const crown = rad < g.rx * 0.66 && ry > g.top - 3.5 + seat && ry < base;
      const brim = inEllipse(rx, ry, cx, base, g.rx + 8, 2.3);
      if (crown) c.put(1, Math.abs(ry - (base - 1.6)) < 0.9 ? 0.25 : felt(0.66, rx, ry, cx, g.top, g.rx, 4), 'headwear');
      else if (brim) c.put(1, ry > base ? 0.36 : felt(0.72, rx, ry, cx, base, g.rx + 8, 2) + 0.04 * Math.cos(Math.atan2(ry - base, rx - cx) * 30), 'headwear');
      else brimShadow(c, ry, base + 2.3, 0.28);
      return;
    }
    case 'hijab': {
      // cloth close round the face, over the brow, down the neck to the breast
      const outer = inEllipse(x, y, cx, g.cy, g.rx + 2.6, g.ry + 2.4) || (y > g.cy && y < g.shoulders + 9 && ad < g.rx + 2.2 + (y - g.cy) * 0.55);
      const face = inEllipse(x, y, cx, g.cy + 2.8, g.rx - 1.4, g.ry - 1.6) && y > g.hairline + 0.4;
      if (!outer || face) return;
      c.put(1, felt(0.46, x, y, cx, g.cy, g.rx + 3, g.ry + 4) - 0.05 * smooth(0.6, 1, Math.cos(Math.atan2(y - g.cy, x - cx) * 7)), 'headwear');
      return;
    }
    case 'headscarf': {
      // a kerchief over the hair, knotted at the nape: the face and the neck stay open
      const inside = inEllipse(x, y, cx, g.cy - 2, g.rx + 2.3, g.ry + 1.5) && y < g.hairline + 0.8 + 3 * smooth(g.rx - 4, g.rx, ad);
      const knot = inEllipse(x, y, cx + g.rx + 1.5, g.earY + 2, 1.6, 1.3);
      if (inside || knot) c.put(1, felt(0.58, x, y, cx, g.top, g.rx + 2, g.ry) + 0.05 * Math.cos((x - cx) * 0.6 + y * 0.9), 'headwear');
      return;
    }
  }
}

export function headwear(g: Geometry, c: Sample, x: number, y: number): void {
  const a = g.spec.accessories.find((p) => p.slot === 'head');
  if (a) headwearShape(g, c, x, y, a);
}

export function jewel(g: Geometry, c: Sample, x: number, y: number): void {
  const a = g.spec.accessories.find((p) => p.slot === 'ear');
  if (!a) return;
  if (g.female) {
    for (const side of [-1, 1]) {
      const jx = g.cx + side * (headHalf(g, g.earY) + g.ear.out * 0.3);
      const jy = g.earY + g.ear.h / 2 + 0.2;
      if (a.variant === 0) {
        // a pearl drop
        if (Math.hypot(x - jx, y - jy - 1.8) < 0.95) c.put(1, Math.hypot(x - jx + 0.35, y - jy - 1.5) < 0.4 ? 1 : 0.66, 'jewel');
        else if (Math.abs(x - jx) < 0.25 && y > jy - 0.4 && y < jy + 1) c.put(1, 0.3, 'jewel');
      } else if (a.variant === 1) {
        if (Math.hypot(x - jx, y - jy) < 0.7) c.put(1, 0.94, 'jewel');
      } else if (Math.abs(Math.hypot(x - jx, y - jy - 1.3) - 1.2) < 0.32) {
        c.put(1, 0.84, 'jewel');
      }
    }
    return;
  }
  // a man wears his jewel as a pin or an order on the coat
  const jx = g.cx - 9 + a.dx;
  const jy = g.shoulders + 7 + a.dy;
  const r = Math.hypot(x - jx, y - jy);
  if (a.variant === 0 && r < 1.6) c.put(1, r < 0.7 ? 0.35 : 0.88, 'jewel');
  if (a.variant === 1 && r < Math.abs(Math.cos(Math.atan2(y - jy, x - jx) * 4)) * 1.1 + 0.8) c.put(1, r < 0.6 ? 1 : 0.8, 'jewel');
  if (a.variant === 2 && Math.abs(x - jx) < 0.7 && y > jy - 2.2 && y < jy + 2.2) c.put(1, Math.abs(y - jy) < 0.5 ? 1 : 0.74, 'jewel');
}

/** A scar: a pale raised seam with dark edges and stitch marks, in each person's own place (D-301). */
export function scars(g: Geometry, c: Sample, x: number, y: number): void {
  if (c.owner === 'background' || c.owner === 'attire' || c.owner === 'headwear') return;
  g.spec.scars.forEach((s, n) => {
    const m = n === 1 ? -1 : 1;
    const ox = g.cx + s.dx * 1.4;
    const oy = s.dy * 1.2;
    let seg: [number, number, number, number];
    switch (s.variant) {
      case 1:
        // down through the brow and the eye
        seg = [ox + m * (g.eyeSep + 0.6), g.browY - 3 + oy, ox + m * (g.eyeSep + 1.8), g.eyeY + 4.5 + oy];
        break;
      case 2:
        // across the lips to the chin
        seg = [ox + m * 0.8, g.mouthY - 3.5 + oy, ox + m * 3, g.chin - 1.5 + oy];
        break;
      case 3:
        // across the forehead
        seg = [ox - m * g.rx * 0.45, g.browY - 5.5 + oy, ox + m * g.rx * 0.25, g.browY - 1.8 + oy];
        break;
      default:
        // a slash across the cheek
        seg = [ox - m * g.rx * 0.74, g.eyeY + 1.6 + oy, ox - m * g.rx * 0.28, g.eyeY + g.ry * 0.42 + oy];
    }
    const { d, t } = segDist(x, y, ...seg);
    if (d > 1.6) return;
    const len = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]);
    const stitch = Math.abs(((t * len) % 2.4) - 1.2) < 0.3 && d < 1.5 && t > 0.06 && t < 0.94;
    if (stitch) c.put(1, 0.2, 'scars');
    else if (d < 0.45) c.put(1, Math.max(c.tone + 0.2, 0.74), 'scars');
    else if (d < 1) c.put(1, c.tone - 0.16, 'scars');
  });
}

export function bandages(g: Geometry, c: Sample, x: number, y: number): void {
  for (const b of g.spec.bandages) {
    const cloth = (fold: number) => 0.86 - 0.1 * smooth(0.55, 1, Math.cos(fold)) + 0.08 * lambert(clamp((x - g.cx) / g.rx, -1, 1), 0);
    switch (b.variant) {
      case 1: {
        // a plaster on the cheek: two crossed strips
        const px = g.cx + g.rx * 0.45 + b.dx;
        const py = g.eyeY + 4.5 + b.dy;
        const s1 = segDist(x, y, px - 2.6, py - 2, px + 2.6, py + 2);
        const s2 = segDist(x, y, px - 2.6, py + 2, px + 2.6, py - 2);
        const d = Math.min(s1.d, s2.d);
        if (d < 1.1) c.put(1, d > 0.8 ? 0.42 : cloth(s1.t * 8), 'bandages');
        break;
      }
      case 2: {
        // cloth tied under the jaw and over the head
        for (const side of [-1, 1]) {
          const bx = g.cx + side * (headHalf(g, y) - 1.2);
          if (Math.abs(x - bx) < 1.8 && y > g.top + 4 && y < g.chin - 1) c.put(1, Math.abs(x - bx) > 1.4 ? 0.45 : cloth(y * 0.9), 'bandages');
        }
        if (y > g.chin - 1.2 && y < g.chin + 2 && Math.abs(x - g.cx) < g.rx * g.head.chin + 3) c.put(1, y > g.chin + 1.5 ? 0.45 : cloth(x * 0.8), 'bandages');
        if (inEllipse(x, y, g.cx - 1.4, g.top - 0.4, 1.5, 1.3) || inEllipse(x, y, g.cx + 1.4, g.top - 0.4, 1.5, 1.3)) c.put(1, cloth(x), 'bandages');
        break;
      }
      default: {
        // a band round the head with a knot over one ear
        const y0 = g.browY - 5.6 + b.dy;
        if (y > y0 && y < y0 + 3.4 && Math.abs(x - g.cx) <= headHalf(g, y, 0.6)) c.put(1, y < y0 + 0.45 || y > y0 + 2.95 ? 0.44 : cloth((x + y * 1.5) * 0.7), 'bandages');
        const kx = g.cx + g.rx + 0.6;
        if (inEllipse(x, y, kx, y0 + 1, 1.6, 1.3) || segDist(x, y, kx, y0 + 2, kx + 1.6, y0 + 5.5).d < 0.7) c.put(1, cloth(y * 1.3) - 0.05, 'bandages');
      }
    }
  }
}

export function eyepatch(g: Geometry, c: Sample, x: number, y: number): void {
  const side = g.spec.eyepatch === 'left' ? -1 : g.spec.eyepatch === 'right' ? 1 : 0;
  if (!side) return;
  const px = g.cx + side * g.eyeSep;
  const py = g.eyeY - 0.2;
  if (inEllipse(x, y, px, py, g.eye.w + 1.1, g.eye.h + 1.9)) {
    c.put(1, 0.1 + 0.16 * gauss(x, y, px - 1, py - 1, 1.4, 1.1), 'eyepatch');
    return;
  }
  // the strap: to the near temple and across the forehead to the far side
  const near = segDist(x, y, px + side * g.eye.w, py - 0.6, g.cx + side * (headHalf(g, py) + 0.3), py - 1.4);
  const far = segDist(x, y, px - side * (g.eye.w - 0.4), py - 1.6, g.cx - side * (g.rx - 0.8), g.top + 5);
  if (Math.min(near.d, far.d) < 0.42) c.put(1, 0.14, 'eyepatch');
}
