import type { FaceSpec, Part } from '../../core/looks';
import { EMPTY, INK, LIGHT, fillOutlined, get, line, newGrid, set, stamp, type Grid, type Paint } from './grid';

/**
 * The portrait as a pixel grid (4.12, D-300, D-304): two paints, no dithering, drawn only from `FaceSpec`.
 * Pure: the same spec gives the same pixels. Every variant and shift of the spec moves or changes pixels (D-301).
 */

export const PORTRAIT_WIDTH = 32;
export const PORTRAIT_HEIGHT = 40;

/** Where the face sits: computed once from the spec, used by every detail. */
interface Frame {
  spec: FaceSpec;
  child: boolean;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  top: number;
  chin: number;
  /** Distance from the middle column to the inner edge of each eye. */
  ex: number;
  eyeY: number;
  browY: number;
  noseY: number;
  mouthY: number;
  hairline: number;
  shoulders: number;
}

function frameOf(spec: FaceSpec): Frame {
  const child = spec.stage === 'child';
  const cx = 16 + spec.head.dx;
  const cy = (child ? 21 : 19) + spec.head.dy;
  const rx = (child ? 7 : spec.sex === 'female' ? 8 : 9) + spec.headWidth;
  const ry = (child ? 9 : 12) + spec.headHeight;
  const eyeY = cy - (child ? 0 : 1) + spec.eyes.dy;
  return {
    spec,
    child,
    cx,
    cy,
    rx,
    ry,
    top: cy - ry,
    chin: cy + ry,
    ex: 2 + spec.eyes.dx,
    eyeY,
    browY: eyeY - 3 + spec.brows.dy,
    noseY: eyeY + 2 + spec.nose.dy,
    mouthY: cy + (child ? 5 : 7) + spec.mouth.dy,
    hairline: cy - ry + (child ? 3 : 4) + (spec.hair?.dy ?? 0),
    shoulders: cy + ry + 2,
  };
}

/** Integer ellipse test around the middle of the head. */
function ellipse(f: Frame, x: number, y: number, rx: number, ry: number, cx = f.cx, cy = f.cy): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx * ry * ry + dy * dy * rx * rx <= rx * rx * ry * ry + rx * ry;
}

/** Four head shapes: oval, broad cheeks, square jaw, narrow chin. */
function inHead(f: Frame, x: number, y: number): boolean {
  const dx = Math.abs(x - f.cx);
  const dy = y - f.cy;
  // a woman's jaw is never square: her fourth shape is the oval
  const variant = f.spec.sex === 'female' && f.spec.head.variant === 2 ? 0 : f.spec.head.variant;
  switch (variant) {
    case 1:
      return dy <= 0 ? ellipse(f, x, y, f.rx, f.ry) : ellipse(f, x, y, f.rx + 1, f.ry - 1);
    case 2:
      return ellipse(f, x, y, f.rx, f.ry) || (dy > 0 && dy <= f.ry - 2 && dx <= f.rx - 1) || (dy === f.ry - 1 && dx <= f.rx - 3);
    case 3:
      return ellipse(f, x, y, f.rx, f.ry) && (dy <= 0 || dx * f.ry * 4 <= f.rx * (f.ry - dy) * 5);
    default:
      return ellipse(f, x, y, f.rx, f.ry);
  }
}

/** A set of pixels painted as hair or beard by its greyness: dark mass, dark with grey streaks, grey, white. */
function paintMass(g: Grid, f: Frame, part: string, inside: (x: number, y: number) => boolean): void {
  const grey = f.spec.grey;
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      let paint: Paint = INK;
      if (!edge) {
        if (grey === 1) paint = Math.abs(x - f.cx) >= f.rx - 3 && x % 3 === 1 ? LIGHT : INK;
        else if (grey === 2) paint = x % 4 === 0 ? INK : LIGHT;
        else if (grey === 3) paint = LIGHT;
      }
      set(g, part, x, y, paint);
    }
  }
}

function long(f: Frame): boolean {
  const hair = f.spec.hair;
  if (!hair) return false;
  return hair.variant === 1 || (f.spec.sex === 'female' && hair.variant !== 4);
}

function backHair(g: Grid, f: Frame): void {
  const hair = f.spec.hair;
  if (!hair) return;
  if (long(f)) {
    const bottom = f.chin + (f.spec.sex === 'female' ? 5 : 2) + hair.dx;
    // two locks fall beside the neck onto the shoulders, set off from dark clothes by a light edge
    const lock = (x: number, y: number) => y >= f.top && y <= bottom && Math.abs(x - f.cx) <= f.rx + 2 && (y > f.cy || ellipse(f, x, y, f.rx + 2, f.ry + 2)) && (y <= f.chin - 2 || Math.abs(x - f.cx) >= f.rx - 3);
    for (let y = f.chin; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        if (!lock(x, y) && get(g, x, y) === INK && (lock(x - 1, y) || lock(x + 1, y) || lock(x, y - 1))) set(g, 'hair-edge', x, y, LIGHT);
      }
    }
    paintMass(g, f, 'hair', lock);
  } else if (hair.variant === 4 && f.spec.sex === 'male' && !f.child) {
    // a queue tied with a ribbon behind the neck
    const x = f.cx + f.rx - 1;
    stamp(g, 'hair', ['#.#', '###', '#.#', '.#.', '.#.'], x - 1, f.chin - 4);
  }
}

function frontHair(g: Grid, f: Frame): void {
  const hair = f.spec.hair;
  const edge = (x: number, y: number, down: number, grow = 1) =>
    ellipse(f, x, y, f.rx + grow, f.ry + grow) && Math.abs(x - f.cx) >= f.rx - 1 && y <= down && y >= f.top + 2;
  if (!hair) {
    // bald: a horseshoe of hair over the ears
    if (f.spec.sex === 'male' && !f.child) paintMass(g, f, 'hair', (x, y) => edge(x, y, f.eyeY - 1) && y >= f.top + 6);
    return;
  }
  const cap = (x: number, y: number, grow: number, line: number) => ellipse(f, x, y, f.rx + grow, f.ry + grow) && y <= line;
  const h = f.hairline;
  let inside: (x: number, y: number) => boolean;
  const variant = f.spec.sex === 'female' && hair.variant !== 2 && hair.variant !== 4 ? -1 : hair.variant;
  switch (variant) {
    case -1:
      // a woman's hair parted in the middle and falling over the ears
      inside = (x, y) =>
        (cap(x, y, 1, h - (Math.abs(x - f.cx - hair.dx) <= 1 ? 1 : 0)) || (edge(x, y, f.eyeY + 5, 2) || (ellipse(f, x, y, f.rx + 2, f.ry + 2) && Math.abs(x - f.cx) >= f.rx - 2 && y <= f.eyeY + 1 && y >= f.top + 2)))
        && !(x === f.cx + hair.dx && y <= h - 2 && y > f.top);
      break;
    case 1:
      inside = (x, y) => cap(x, y, 1, h) || edge(x, y, f.eyeY + 2);
      break;
    case 2: {
      // curls: a rough edge of bumps, one in three pixels of the outer ring left out
      inside = (x, y) => (cap(x, y, 2, h) && (ellipse(f, x, y, f.rx + 1, f.ry + 1) || (x + y) % 3 !== 0)) || edge(x, y, f.eyeY - 2, 2);
      break;
    }
    case 3:
      // parted to one side: the fringe falls lower on the far side
      inside = (x, y) => (cap(x, y, 1, x > f.cx + hair.dx ? h + 1 : h - 1) || edge(x, y, f.eyeY - 2)) && !(x === f.cx - 3 + hair.dx && y <= h - 1 && y > f.top);
      break;
    case 4:
      inside = (x, y) => cap(x, y, 1, h - 1) || edge(x, y, f.eyeY - 3) || (f.spec.sex === 'female' && ellipse(f, x, y, 3, 2, f.cx + hair.dx, f.top - 1));
      break;
    case 5:
      // a high forehead: the hairline recedes at the temples
      inside = (x, y) => (cap(x, y, 1, h - 2) || (cap(x, y, 1, h) && Math.abs(x - f.cx) <= 1)) || edge(x, y, f.eyeY - 2);
      break;
    default:
      inside = (x, y) => cap(x, y, 1, h) || edge(x, y, f.eyeY - 2);
  }
  paintMass(g, f, 'hair', inside);
}

function neck(g: Grid, f: Frame): void {
  const half = f.child ? 2 : 3;
  for (let y = f.chin - 3; y <= f.shoulders + 1; y++) {
    for (let dx = -half; dx <= half; dx++) set(g, 'neck', f.cx + dx, y, Math.abs(dx) === half ? INK : LIGHT);
  }
  // the shadow under the chin
  if (!f.child) line(f.cx - half + 1, f.chin + 1, f.cx + half - 1, f.chin + 1, (x, y) => set(g, 'neck', x, y, INK));
}

function body(g: Grid, f: Frame): void {
  const { spec, cx } = f;
  const st = f.shoulders;
  const female = spec.sex === 'female';
  const half = (y: number) => Math.min(f.child ? 11 : 15, (f.child ? 4 : 5) + (y - st) * 3);
  const inBody = (x: number, y: number) => y >= st && y < PORTRAIT_HEIGHT + 1 && Math.abs(x - cx) <= half(y);
  if (spec.attire === 0) {
    // a poor shirt: light cloth, an open collar and a patch
    fillOutlined(g, 'attire', inBody);
    line(cx, st, cx - 3, st + 3, (x, y) => set(g, 'attire', x, y, INK));
    line(cx, st, cx + 3, st + 3, (x, y) => set(g, 'attire', x, y, INK));
    stamp(g, 'attire', ['###', '#.#', '###'], cx + 6, st + 3);
    return;
  }
  for (let y = st; y < PORTRAIT_HEIGHT; y++) for (let x = 0; x < g.width; x++) if (inBody(x, y)) set(g, 'attire', x, y, INK);
  // skin at the neckline: a narrow V, a wide one for a woman's dress
  const open = female ? 5 : 3;
  for (let y = st; y < st + open; y++) {
    const w = (female ? 4 : 3) - Math.floor(((y - st) * (female ? 4 : 3)) / open);
    for (let x = cx - w; x <= cx + w; x++) set(g, 'neck', x, y, LIGHT);
  }
  if (spec.attire >= 2) {
    // lapels and buttons
    for (let y = st + 1; y < PORTRAIT_HEIGHT; y++) {
      const d = 3 + (y - st);
      if (d <= half(y) - 2) {
        set(g, 'attire', cx - d, y, LIGHT);
        set(g, 'attire', cx + d, y, LIGHT);
      }
    }
    if (!female) for (let y = st + open + 1; y < PORTRAIT_HEIGHT; y += 2) set(g, 'attire', cx, y, LIGHT);
  }
  if (spec.attire >= 3) {
    if (female) {
      // a necklace on the skin of the neckline
      for (const dx of [-3, -1, 1, 3]) set(g, 'attire', cx + dx, st + (Math.abs(dx) === 3 ? 0 : 1), INK);
      set(g, 'attire', cx, st + 2, INK);
    } else {
      // a lace cravat falling down the chest
      for (let y = st + 1; y < Math.min(PORTRAIT_HEIGHT, st + 7); y++) {
        const w = 1 + ((y - st) % 2);
        for (let x = cx - w; x <= cx + w; x++) set(g, 'attire', x, y, LIGHT);
        set(g, 'attire', cx - w - 1, y, INK);
        set(g, 'attire', cx + w + 1, y, INK);
      }
    }
    // braid along the shoulders
    for (let x = 0; x < g.width; x++) if (Math.abs(x - cx) >= half(st + 3) - 3 && inBody(x, st + 4)) set(g, 'attire', x, st + 4, LIGHT);
  }
}

const EARS: readonly (readonly string[])[] = [
  ['.#', '#o', '#o', '.#'],
  ['.#', '#o', '#o', '#o', '#o', '.#'],
  ['##', '#o', '#o', '#o', '##'],
];

function ears(g: Grid, f: Frame): void {
  const e = f.spec.ears;
  const sprite = EARS[e.variant] ?? EARS[0]!;
  const y = f.eyeY - 1 + e.dy - (e.variant === 1 ? 1 : 0);
  const out = f.rx + 2 + (e.variant === 2 ? 0 : 0) - (e.dx < 0 ? 1 : 0);
  stamp(g, 'ears', sprite, f.cx - out, y);
  stamp(g, 'ears', sprite, f.cx + out - 1, y, true);
}

/** Lowest pixel of the ear: where an earring hangs. */
function lobe(f: Frame): { x: number; y: number } {
  const e = f.spec.ears;
  const sprite = EARS[e.variant] ?? EARS[0]!;
  return { x: f.cx - f.rx - 2 - (e.dx < 0 ? 1 : 0), y: f.eyeY - 1 + e.dy - (e.variant === 1 ? 1 : 0) + sprite.length };
}

const EYES: readonly (readonly string[])[] = [
  ['.###', '#o#o'],
  ['####', '.##.'],
  ['.##.', '#o##'],
  ['####', '#o#o'],
  ['..##', '#o##'],
];

function eyeSprite(spec: FaceSpec): readonly string[] {
  const base = EYES[spec.eyes.variant] ?? EYES[0]!;
  switch (spec.expression) {
    case 'dead':
      return ['....', '####'];
    case 'pain':
      return ['#...', '.###'];
    case 'shame':
      return ['....', '####'];
    case 'threat':
    case 'anger':
      return ['####', base[1]!];
    case 'joy':
      return ['.##.', '#..#'];
    default:
      return base;
  }
}

function eyes(g: Grid, f: Frame): void {
  const sprite = eyeSprite(f.spec);
  const left = f.cx - f.ex - 4;
  const right = f.cx + f.ex + 1;
  if (f.spec.eyepatch !== 'left') stamp(g, 'eyes', sprite, left, f.eyeY);
  if (f.spec.eyepatch !== 'right') stamp(g, 'eyes', sprite, right, f.eyeY, true);
  if (f.spec.sex === 'female' && f.spec.expression !== 'dead') {
    if (f.spec.eyepatch !== 'left') set(g, 'eyes', left - 1, f.eyeY, INK);
    if (f.spec.eyepatch !== 'right') set(g, 'eyes', right + 4, f.eyeY, INK);
  }
  if (f.spec.expression === 'loss') {
    // a tear under each open eye
    if (f.spec.eyepatch !== 'left') set(g, 'eyes', left + 2, f.eyeY + 3, INK);
    if (f.spec.eyepatch !== 'right') set(g, 'eyes', right + 1, f.eyeY + 3, INK);
  }
}

const BROWS: readonly (readonly string[])[] = [
  ['####'],
  ['.##.', '#..#'],
  ['####', '####'],
  ['..##', '##..'],
];

/** Brows of the left eye; the inner end drops with anger and temper, rises with grief and pain. */
function brows(g: Grid, f: Frame): void {
  const { spec } = f;
  const sprite = BROWS[spec.brows.variant] ?? BROWS[0]!;
  const angry = spec.expression === 'anger' || spec.expression === 'threat' || (spec.temper < 0 && spec.expression === 'neutral');
  const sad = spec.expression === 'loss' || spec.expression === 'pain' || spec.expression === 'shame' || (spec.temper > 0 && spec.expression === 'neutral');
  const tilt = angry ? 1 : sad ? -1 : 0;
  const left = f.cx - f.ex - 4 + spec.brows.dx;
  const right = f.cx + f.ex + 1 - spec.brows.dx;
  sprite.forEach((row, dy) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== '#') continue;
      const inner = i >= 2 ? tilt : 0;
      set(g, 'brows', left + i, f.browY + dy + inner, INK);
      set(g, 'brows', right + 3 - i, f.browY + dy + inner, INK);
    }
  });
}

const NOSES: readonly (readonly string[])[] = [
  ['..#', '..#', '..#', '##.'],
  ['.#.', '..#', '..#', '...#', '###.'],
  ['.#..', '.#..', '#..#', '.##.'],
  ['...', '..#', '#.#'],
  ['.#', '.#', '.#', '.#', '##'],
];

function nose(g: Grid, f: Frame): void {
  const n = f.spec.nose;
  const sprite = (f.child ? NOSES[3] : NOSES[n.variant]) ?? NOSES[0]!;
  const w = Math.max(...sprite.map((r) => r.length));
  stamp(g, 'nose', sprite, f.cx - Math.floor(w / 2) + n.dx, f.noseY);
}

const MOUTH_WIDTHS = [5, 7, 5, 7];

function mouthSprite(spec: FaceSpec, w: number): string[] {
  const full = '#'.repeat(w);
  const inner = (ch: string) => '#' + ch.repeat(w - 2) + '#';
  const lip = '.' + '#'.repeat(w - 2) + '.';
  switch (spec.expression) {
    case 'joy':
      return [inner('.'), lip];
    case 'triumph':
      // a one-sided grin
      return ['.'.repeat(w - 1) + '#', '#'.repeat(w - 1) + '.'];
    case 'threat':
      return [full];
    case 'pain':
      return [full, inner('o'), full];
    case 'anger':
      // bared teeth
      return [full, '#' + Array.from({ length: w - 2 }, (_, i) => (i % 2 ? '#' : 'o')).join('') + '#', lip];
    case 'loss':
      return [lip, inner('.')];
    case 'shame':
      return ['..' + '#'.repeat(w - 3) + '.'];
    case 'dead':
      return [lip];
    default:
      return spec.mouth.variant >= 2 || spec.sex === 'female' ? [full, lip] : [full];
  }
}

function mouthBox(f: Frame): { x: number; w: number; rows: string[] } {
  const w = (f.child ? 5 : MOUTH_WIDTHS[f.spec.mouth.variant]) ?? 5;
  return { x: f.cx - Math.floor(w / 2) + f.spec.mouth.dx, w, rows: mouthSprite(f.spec, w) };
}

function mouth(g: Grid, f: Frame): void {
  const m = mouthBox(f);
  stamp(g, 'mouth', m.rows, m.x, f.mouthY);
}

function beard(g: Grid, f: Frame): void {
  const b = f.spec.beard;
  if (!b) return;
  const my = f.mouthY + b.dy;
  const head = (x: number, y: number) => inHead(f, x, y);
  const below = (x: number, y: number) => y > f.cy && y <= f.chin + 2 && ellipse(f, x, y, f.rx - 2, f.ry + 2);
  const moustache = (x: number, y: number) => (y === my - 1 || y === my - 2) && Math.abs(x - f.cx - b.dx) <= 3;
  let inside: (x: number, y: number) => boolean;
  switch (b.variant) {
    case 1:
      inside = (x, y) => moustache(x, y) || (y >= my + 2 && y <= f.chin + 2 && Math.abs(x - f.cx - b.dx) <= 2);
      break;
    case 2:
      inside = (x, y) => moustache(x, y) || (y === my && Math.abs(x - f.cx - b.dx) === 3 + 1) || (y === my + 1 && Math.abs(x - f.cx - b.dx) === 4);
      break;
    case 3:
      inside = (x, y) => moustache(x, y) || ((head(x, y) || below(x, y)) && (y >= my + 2 || (Math.abs(x - f.cx) >= f.rx - 1 && y >= f.eyeY + 2)));
      break;
    default:
      inside = (x, y) => (head(x, y) || below(x, y)) && (y >= my - 2 || (Math.abs(x - f.cx) >= f.rx - 2 && y >= f.eyeY + 3));
  }
  paintMass(g, f, 'beard', inside);
  // the lips stay readable inside a beard
  const m = mouthBox(f);
  for (let y = f.mouthY - 1; y <= f.mouthY + m.rows.length; y++) {
    for (let x = m.x; x < m.x + m.w; x++) if (get(g, x, y) !== EMPTY && !(Math.abs(y - f.mouthY - (m.rows.length - 1) / 2) > m.rows.length / 2 && (x === m.x || x === m.x + m.w - 1))) set(g, 'beard', x, y, LIGHT);
  }
}

/** Lines that only mark skin (the light paint): wrinkles and marks of illness are not drawn over hair. */
function onSkin(g: Grid, part: string): (x: number, y: number) => void {
  return (x, y) => { if (get(g, x, y) === LIGHT) set(g, part, x, y, INK); };
}

function wrinkles(g: Grid, f: Frame): void {
  const w = f.spec.wrinkles;
  if (!w) return;
  const ink = onSkin(g, 'wrinkles');
  const fy = f.browY - 2 + w.dy;
  const cx = f.cx + w.dx;
  const forehead = (y: number) => {
    if (w.variant === 1) {
      line(cx - 4, y, cx - 1, y, ink);
      line(cx + 1, y, cx + 4, y, ink);
    } else if (w.variant === 2) {
      line(cx - 3, y, cx + 3, y, ink);
      ink(cx - 4, y + 1);
      ink(cx + 4, y + 1);
    } else line(cx - 3, y, cx + 3, y, ink);
  };
  forehead(fy);
  if (w.level >= 2) {
    // crow's feet at the outer corners of the eyes
    const lx = f.cx - f.ex - 5;
    const rx = f.cx + f.ex + 5;
    ink(lx, f.eyeY + 1);
    ink(lx - 1, f.eyeY + 2);
    ink(rx, f.eyeY + 1);
    ink(rx + 1, f.eyeY + 2);
  }
  if (w.level >= 3) {
    forehead(fy - 2);
    const m = mouthBox(f);
    line(f.cx - 3, f.noseY + 3, m.x - 1, f.mouthY + 1, ink);
    line(f.cx + 3, f.noseY + 3, m.x + m.w, f.mouthY + 1, ink);
  }
}

function illness(g: Grid, f: Frame): void {
  const level = f.spec.illness;
  if (level === 0) return;
  const ink = onSkin(g, 'illness');
  const left = f.cx - f.ex - 4;
  const right = f.cx + f.ex + 1;
  // dark rings under the eyes
  line(left + 1, f.eyeY + 2, left + 3, f.eyeY + 2, ink);
  line(right, f.eyeY + 2, right + 2, f.eyeY + 2, ink);
  if (level < 2) return;
  // hollow cheeks and sweat on the brow
  line(f.cx - f.rx + 2, f.mouthY - 3, f.cx - f.rx + 2, f.mouthY - 1, ink);
  line(f.cx + f.rx - 2, f.mouthY - 3, f.cx + f.rx - 2, f.mouthY - 1, ink);
  stamp(g, 'illness', ['.#.', '#o#', '.#.'], f.cx + f.rx - 4, f.browY - 3);
}

function mole(g: Grid, f: Frame): void {
  if (f.spec.beauty >= 0) return;
  const x = f.cx + 4 + f.spec.nose.dx;
  const y = f.noseY + 3 + f.spec.mouth.dy;
  if (get(g, x, y) === LIGHT) set(g, 'mole', x, y, INK);
}

/** A scar turns light into ink and ink into light: it shows on skin, on a beard and on hair alike. */
function scars(g: Grid, f: Frame): void {
  const cut = (x: number, y: number) => {
    const p = get(g, x, y);
    if (p !== EMPTY) set(g, 'scars', x, y, p === INK ? LIGHT : INK);
  };
  const stitch = (x0: number, y0: number, x1: number, y1: number) => {
    let i = 0;
    line(x0, y0, x1, y1, (x, y) => {
      cut(x, y);
      // stitches across the cut
      if (i++ % 2 === 1) { cut(x - 1, y); cut(x + 1, y); }
    });
  };
  f.spec.scars.forEach((s: Part, n) => {
    const x = f.cx + s.dx;
    const y = f.eyeY + s.dy;
    // the second scar of a person mirrors to the other side, so two scars never lie on each other
    const m = n === 1 ? -1 : 1;
    switch (s.variant) {
      case 1:
        // down through the brow and the eye
        stitch(x + 4 * m, f.browY - 3, x + 5 * m, y + 5);
        break;
      case 2:
        // across the lips to the chin
        stitch(x - 1 * m, f.mouthY - 3, x + 3 * m, f.mouthY + 4);
        break;
      case 3:
        // across the forehead
        stitch(x - 5 * m, f.browY - 5, x + 3 * m, f.browY - 2);
        break;
      default:
        // a slash across the cheek
        stitch(x - 7 * m, y + 1, x - 2 * m, y + 7);
    }
  });
}

function bandages(g: Grid, f: Frame): void {
  for (const b of f.spec.bandages) {
    const y0 = f.browY - 4 + b.dy;
    switch (b.variant) {
      case 1: {
        // a plaster on the cheek
        const x = f.cx + 4 + b.dx;
        const y = f.eyeY + 3 + b.dy;
        stamp(g, 'bandages', ['#####', '#o#o#', '##o##', '#o#o#', '#####'], x, y);
        break;
      }
      case 2:
        // cloth tied under the jaw and over the head
        for (const side of [-1, 1]) {
          for (let y = f.top + 3; y <= f.chin; y++) {
            const x = f.cx + side * (f.rx - 1);
            set(g, 'bandages', x, y, LIGHT);
            set(g, 'bandages', x + side, y, INK);
            set(g, 'bandages', x - side, y, INK);
          }
        }
        line(f.cx - f.rx + 1, f.chin + 1, f.cx + f.rx - 1, f.chin + 1, (x, y) => set(g, 'bandages', x, y, INK));
        stamp(g, 'bandages', ['#.#', '.#.', '#.#'], f.cx - 1 + b.dx, f.top - 1);
        break;
      default:
        // a band round the head with a knot on one side
        for (let y = y0; y <= y0 + 2; y++) for (let x = f.cx - f.rx; x <= f.cx + f.rx; x++) if (inHead(f, x, y)) set(g, 'bandages', x, y, y === y0 + 1 ? LIGHT : INK);
        stamp(g, 'bandages', ['##.', '.##', '##.'], f.cx + f.rx + b.dx, y0);
    }
  }
}

function eyepatch(g: Grid, f: Frame): void {
  const side = f.spec.eyepatch;
  if (!side) return;
  const x = side === 'left' ? f.cx - f.ex - 4 : f.cx + f.ex + 1;
  stamp(g, 'eyepatch', ['.##.', '####', '####', '.##.'], x, f.eyeY - 1);
  const ink = (px: number, py: number) => set(g, 'eyepatch', px, py, INK);
  if (side === 'left') {
    line(x, f.eyeY, f.cx - f.rx, f.eyeY - 1, ink);
    line(x + 3, f.eyeY - 1, f.cx + f.rx - 1, f.top + 5, ink);
  } else {
    line(x + 3, f.eyeY, f.cx + f.rx, f.eyeY - 1, ink);
    line(x, f.eyeY - 1, f.cx - f.rx + 1, f.top + 5, ink);
  }
}

function headwear(g: Grid, f: Frame, a: Part): void {
  const cx = f.cx + a.dx;
  const top = f.top + a.dy;
  const female = f.spec.sex === 'female';
  if (female) {
    switch (a.variant) {
      case 1:
        // a linen hood framing the face, with a seam over the crown
        fillOutlined(g, 'headwear', (x, y) => ellipse(f, x, y, f.rx + 3, f.ry + 3) && y <= f.cy + 4 && !(y > f.hairline - 1 && Math.abs(x - f.cx) <= f.rx - 1));
        line(cx, f.top - 2, cx, f.hairline - 2, (x, y) => set(g, 'headwear', x, y, INK));
        return;
      case 2:
        // a broad hat with a ribbon
        for (let y = top - 4; y <= top; y++) for (let x = cx - f.rx + 3; x <= cx + f.rx - 3; x++) set(g, 'headwear', x, y, y === top - 1 ? LIGHT : INK);
        line(cx - f.rx - 4, top + 1, cx + f.rx + 4, top + 1, (x, y) => set(g, 'headwear', x, y, INK));
        line(cx - f.rx - 3, top + 2, cx + f.rx + 3, top + 2, (x, y) => set(g, 'headwear', x, y, INK));
        return;
      default:
        // a linen cap with a frilled edge
        fillOutlined(g, 'headwear', (x, y) => ellipse(f, x, y, f.rx + 1, f.ry + 1, cx) && y <= f.hairline - 1);
        for (let x = cx - f.rx; x <= cx + f.rx; x += 2) set(g, 'headwear', x, f.hairline, INK);
        return;
    }
  }
  switch (a.variant) {
    case 1:
      // a soft cap tipped to one side
      fillOutlined(g, 'headwear', (x, y) => ellipse(f, x, y, f.rx + 2, 4, cx - 1, top + 1) && y <= top + 2, INK);
      line(cx - f.rx, top + 3, cx + f.rx, top + 3, (x, y) => set(g, 'headwear', x, y, INK));
      return;
    case 2:
      // a fur cap: light fur with a dark band
      fillOutlined(g, 'headwear', (x, y) => Math.abs(x - cx) <= f.rx && y >= top - 3 && y <= top + 3 && (y >= top - 1 || Math.abs(x - cx) <= f.rx - 2));
      line(cx - f.rx, top + 2, cx + f.rx, top + 2, (x, y) => set(g, 'headwear', x, y, INK));
      return;
    default: {
      // a tricorn seen from the front: peaks at the sides, the brim dips to a point over the brow, a light braid on its edge
      const hw = f.rx + 3;
      for (let x = cx - hw; x <= cx + hw; x++) {
        const t = Math.abs(x - cx);
        const bottom = top + 3 - Math.floor((t * 4) / hw);
        const crown = t <= f.rx - 3 ? top - 4 : t >= hw - 1 ? top - 3 : top - 2;
        for (let y = crown; y <= bottom; y++) set(g, 'headwear', x, y, y === bottom - 1 && t <= f.rx && bottom - 1 > crown + 1 ? LIGHT : INK);
      }
    }
  }
}

const EARRINGS: readonly (readonly string[])[] = [['#', 'o', '#'], ['#', '#'], ['.#', '#.', '.#']];
const PINS: readonly (readonly string[])[] = [['.o.', 'o#o', '.o.'], ['ooo', 'o#o'], ['o', 'o', 'o']];

function jewel(g: Grid, f: Frame, a: Part): void {
  if (f.spec.sex === 'female') {
    const sprite = EARRINGS[a.variant] ?? EARRINGS[0]!;
    const { x, y } = lobe(f);
    stamp(g, 'jewel', sprite, x + a.dx, y);
    stamp(g, 'jewel', sprite, f.cx + (f.cx - x) - (sprite[0]!.length - 1) - a.dx, y, true);
    return;
  }
  // a man wears his jewel as a pin on the chest
  stamp(g, 'jewel', PINS[a.variant] ?? PINS[0]!, f.cx + 6 + a.dx, f.shoulders + 3 + a.dy);
}

/** Light falls from the left: a thicker line of shadow along the right jaw. */
function jawShadow(g: Grid, f: Frame): void {
  for (let y = f.eyeY + 3; y <= f.chin; y++) {
    for (let x = f.cx + 1; x < g.width; x++) if (inHead(f, x, y) && !inHead(f, x + 2, y)) set(g, 'head', x, y, INK);
  }
}

export function portraitGrid(spec: FaceSpec): Grid {
  const g = newGrid(PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
  const f = frameOf(spec);
  body(g, f);
  backHair(g, f);
  neck(g, f);
  ears(g, f);
  fillOutlined(g, 'head', (x, y) => inHead(f, x, y));
  jawShadow(g, f);
  if (spec.head.variant === 2 && spec.sex === 'male' && !f.child) line(f.cx - 2, f.chin - 1, f.cx + 2, f.chin - 1, (x, y) => set(g, 'head', x, y, INK));
  const ear = spec.accessories.find((a) => a.slot === 'ear');
  frontHair(g, f);
  wrinkles(g, f);
  brows(g, f);
  eyes(g, f);
  illness(g, f);
  nose(g, f);
  beard(g, f);
  mouth(g, f);
  mole(g, f);
  scars(g, f);
  bandages(g, f);
  eyepatch(g, f);
  const hat = spec.accessories.find((a) => a.slot === 'head');
  if (hat) headwear(g, f, hat);
  if (ear) jewel(g, f, ear);
  return g;
}
