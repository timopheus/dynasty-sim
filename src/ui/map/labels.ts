import { mapName } from '../i18n';
import type { MapModel, Point } from './model';
import { INK } from './palette';
import type { MapMode, MapOverlay } from './types';
import { fade, nameAlphas } from './zoom';

/** The face of the names on the map: the serif of the interface (style.css). */
const SERIF = "Georgia, 'Times New Roman', serif";

type Box = { x0: number; y0: number; x1: number; y1: number };

function quad(p0: Point, c: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
}

/**
 * Writes text along a quadratic curve, letter by letter, spaced to fill the curve (the realm and sea names of CK3).
 * Sizes are in map units; the caller has set the map transform.
 */
function curvedText(ctx: CanvasRenderingContext2D, text: string, line: number[], size: number, spacing: number, fill: string, halo: string | null, maxSpread = Infinity, italic = false): void {
  const [x0, y0, cx, cy, x1, y1] = line as [number, number, number, number, number, number];
  const p0 = { x: x0, y: y0 }, c = { x: cx, y: cy }, p1 = { x: x1, y: y1 };
  // arc length by sampling
  const samples: { t: number; len: number }[] = [{ t: 0, len: 0 }];
  let prev = p0, len = 0;
  for (let k = 1; k <= 60; k++) {
    const t = k / 60;
    const p = quad(p0, c, p1, t);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    samples.push({ t, len });
    prev = p;
  }
  ctx.font = `${italic ? 'italic ' : ''}${size}px ${SERIF}`;
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const natural = widths.reduce((s, w) => s + w, 0) + spacing * size * (text.length - 1);
  // the letters spread to fill the curve, but no wider than `maxSpread` letter-sizes apart
  const fill0 = text.length > 1 ? (len * 0.94 - widths.reduce((s, w) => s + w, 0)) / (text.length - 1) : 0;
  const gap = text.length > 1 ? Math.max(spacing * size, Math.min(fill0, maxSpread * size)) : 0;
  const total = widths.reduce((s, w) => s + w, 0) + gap * (text.length - 1);
  let at = (len - Math.min(total, Math.max(natural, len))) / 2;
  if (total > len) at = (len - total) / 2;
  const tAt = (d: number) => {
    const target = Math.max(0, Math.min(len, d));
    for (let k = 1; k < samples.length; k++) {
      const s = samples[k] as { t: number; len: number }, r = samples[k - 1] as { t: number; len: number };
      if (s.len >= target) return r.t + ((target - r.len) / Math.max(1e-6, s.len - r.len)) * (s.t - r.t);
    }
    return 1;
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [...text].forEach((ch, k) => {
    const w = widths[k] as number;
    const mid = at + w / 2;
    const t = tAt(mid);
    const p = quad(p0, c, p1, t);
    const q = quad(p0, c, p1, Math.min(1, t + 0.01));
    const r = quad(p0, c, p1, Math.max(0, t - 0.01));
    const angle = Math.atan2(q.y - r.y, q.x - r.x);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    if (halo) {
      ctx.strokeStyle = halo;
      ctx.lineWidth = size * 0.22;
      ctx.lineJoin = 'round';
      ctx.strokeText(ch, 0, 0);
    }
    ctx.fillStyle = fill;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    at += w + gap;
  });
}

function plainText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, halo: string, italic = false, weight = ''): void {
  ctx.font = `${italic ? 'italic ' : ''}${weight ? `${weight} ` : ''}${size}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = halo;
  ctx.lineWidth = size * 0.28;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Where each people's name goes: the cell of its land nearest the middle of it, and how wide its land is. */
const CULTURE_MARKS = new WeakMap<MapModel, { id: number; name: string; at: Point; span: number }[]>();

function cultureMarks(m: MapModel): { id: number; name: string; at: Point; span: number }[] {
  const known = CULTURE_MARKS.get(m);
  if (known) return known;
  const out: { id: number; name: string; at: Point; span: number }[] = [];
  for (const c of m.cultures.values()) {
    if (c.id === 0) continue;
    const cells: number[] = [];
    for (let i = 0; i < m.cellCount; i++) if (!m.water[i] && m.culture[i] === c.id) cells.push(i);
    if (cells.length < 6) continue;
    let sx = 0, sy = 0, x0 = Infinity, x1 = -Infinity;
    for (const i of cells) {
      const p = m.centers[i] as Point;
      sx += p.x; sy += p.y; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    }
    const mid = { x: sx / cells.length, y: sy / cells.length };
    let best = cells[0] as number, bestD = Infinity;
    for (const i of cells) {
      const p = m.centers[i] as Point;
      const d = Math.hypot(p.x - mid.x, p.y - mid.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    out.push({ id: c.id, name: c.name, at: m.centers[best] as Point, span: (x1 - x0) * 0.7 });
  }
  CULTURE_MARKS.set(m, out);
  return out;
}

/**
 * The names on the map, by zoom (CK3): realms and seas from afar, provinces in the middle, towns and the places of the
 * game close up. Sizes are chosen in screen pixels and turned into map units.
 */
export function drawLabels(ctx: CanvasRenderingContext2D, m: MapModel, zoom: number, paperAlpha: number, overlay: MapOverlay, box: Box, mode: MapMode = 'realms'): void {
  const px = 1 / zoom;
  // realms: big spaced capitals along the shape of the realm, fading as the provinces come in
  const { realm: realmAlpha, province: provAlpha } = nameAlphas(zoom, mode);
  if (mode === 'cultures') {
    // the peoples mode names the peoples, not the realms (CK3)
    ctx.globalAlpha = Math.max(0.35, realmAlpha) * 0.92;
    for (const c of cultureMarks(m)) {
      const name = (overlay.peoples.get(c.id) ?? mapName(c.name)).toUpperCase();
      const size = Math.max(10 * px, Math.min(c.span / (name.length * 1.1), 22 * px));
      plainText(ctx, name, c.at.x, c.at.y, size, 'rgba(40, 28, 16, 0.9)', 'rgba(240, 228, 200, 0.7)', false, 'bold');
    }
    ctx.globalAlpha = 1;
  } else if (realmAlpha > 0) {
    ctx.globalAlpha = realmAlpha * 0.92;
    for (const s of m.states.values()) {
      if (!s.label) continue;
      const [x0, y0, , , x1, y1] = s.label as [number, number, number, number, number, number];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const name = mapName(s.name).toUpperCase();
      const size = Math.max(11 * px, Math.min(len / (name.length * 1.15), 34 * px));
      curvedText(ctx, name, s.label, size, 0.35, 'rgba(40, 28, 16, 0.9)', 'rgba(240, 228, 200, 0.55)', 2.2);
    }
    ctx.globalAlpha = 1;
  }
  // seas: italic, spaced, pale
  const seaAlpha = 1 - fade(zoom, 2.4, 3.4);
  if (seaAlpha > 0) {
    ctx.globalAlpha = seaAlpha * 0.85;
    for (const s of m.seas) {
      if (!s.label) continue;
      const [x0, y0, , , x1, y1] = s.label as [number, number, number, number, number, number];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const name = mapName(s.name);
      const size = Math.max(9 * px, Math.min(len / (name.length * 1.3), 18 * px));
      curvedText(ctx, name, s.label, size, 0.3, paperAlpha > 0.5 ? 'rgba(50, 70, 72, 0.85)' : INK.seaLabel, null, 0.9, true);
    }
    ctx.globalAlpha = 1;
  }
  // provinces: small capitals at their middle
  if (provAlpha > 0) {
    ctx.globalAlpha = provAlpha * 0.85;
    for (const p of m.provinces.values()) {
      if (p.x < box.x0 || p.x > box.x1 || p.y < box.y0 || p.y > box.y1) continue;
      plainText(ctx, mapName(p.name).toUpperCase(), p.x, p.y, 10.5 * px, 'rgba(40, 30, 18, 0.85)', 'rgba(235, 225, 200, 0.6)');
    }
    ctx.globalAlpha = 1;
  }
  // towns of the map close up
  const townAlpha = fade(zoom, 3.2, 4.2);
  if (townAlpha > 0) {
    ctx.globalAlpha = townAlpha;
    // a place of the game is named once: its name may be translated (RU.1), so the two are compared as drawn
    const places = new Set(overlay.places.map((p) => mapName(p.name)));
    for (const b of m.burgs) {
      if (places.has(mapName(b.name)) || b.x < box.x0 || b.x > box.x1 || b.y < box.y0 || b.y > box.y1) continue;
      plainText(ctx, mapName(b.name), b.x, b.y + 9 * px, 11 * px, INK.label, INK.labelHalo);
    }
    ctx.globalAlpha = 1;
  }
  // the places of the game: always named, smaller from afar (they are where the hero can go)
  const near = Math.min(1, Math.max(0.8, zoom / 1.6));
  for (const p of overlay.places) {
    const strong = p.id === overlay.selected || p.id === overlay.hovered;
    plainText(ctx, mapName(p.name), p.at.x, p.at.y + 12 * px * near, (p.kind === 'city' ? 13.5 : 12) * px * near, INK.label, INK.labelHalo, false, strong ? 'bold' : '');
  }
}
