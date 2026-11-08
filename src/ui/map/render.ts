import type { Camera, Viewport } from './camera';
import { visibleBox } from './camera';
import type { MapModel, Point } from './model';
import type { MapMode, MapOverlay } from './types';
export { MAP_MODES } from './types';
export type { MapMode, MapOverlay, PlaceMark } from './types';
import { chain, smooth, type Segment } from './geometry';
import { drawLabels } from './labels';
import { INK, PAPER, TERRAIN_COLOR, mix, shade } from './palette';

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Below this zoom (screen px per map unit) the map is the paper map; above the upper bound, the terrain; between, both fade. */
export const PAPER_FROM = 1.25;
export const PAPER_TO = 1.75;
/** Scale of the cached paper map, in pixels per map unit. */
const PAPER_SCALE = 2;
/** Scale of the cached terrain close up. */
const BASE_SCALE = 2;

/** A tiny seeded random in 0..1 for the marks of the land: the same for a cell on every frame. */
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function polygonPath(poly: Point[], path = new Path2D()): Path2D {
  poly.forEach((p, k) => (k === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
  path.closePath();
  return path;
}

/** A smooth line through the points (midpoint quadratic curves), as rivers and roads are drawn. */
function curvePath(points: Point[], path = new Path2D()): Path2D {
  if (points.length < 2) return path;
  const first = points[0] as Point;
  path.moveTo(first.x, first.y);
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i] as Point, q = points[i + 1] as Point;
    path.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  const last = points[points.length - 1] as Point;
  path.lineTo(last.x, last.y);
  return path;
}

/** Adds a line to a path; a closed line is closed. */
function addLine(path: Path2D, points: Point[], closed: boolean): void {
  points.forEach((p, k) => (k === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
  if (closed) path.closePath();
}

/** Segments joined into smooth lines, all in one path. */
function linesPath(segments: Segment[], rounds: number): Path2D {
  const path = new Path2D();
  for (const line of chain(segments)) addLine(path, smooth(line.points, line.closed, rounds), line.closed);
  return path;
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(width);
  c.height = Math.ceil(height);
  return c;
}

export class MapRenderer {
  readonly model: MapModel;
  private readonly cellPaths: Path2D[];
  /** Land inside the smooth coast (even-odd: lakes are holes). */
  private readonly landPath = new Path2D();
  /** Water: the map outside the smooth coast. */
  private readonly waterPath = new Path2D();
  private readonly coastPath = new Path2D();
  private readonly provincePath: Path2D;
  private readonly realmPath: Path2D;
  private readonly realmEdges = new Map<number, Path2D>();
  private readonly realmArea = new Map<number, Path2D>();
  private readonly rivers: { path: Path2D; width: number }[];
  private readonly routes: { path: Path2D; group: string }[];
  private readonly terrainFill: string[];
  private readonly paper = new Map<MapMode, HTMLCanvasElement>();
  private readonly tints = new Map<MapMode, HTMLCanvasElement>();
  /** The cached terrain, plain and with the realms' ribbons baked in (one picture to draw a frame, not two). */
  private readonly bases = new Map<boolean, HTMLCanvasElement>();

  constructor(model: MapModel) {
    this.model = model;
    this.cellPaths = model.polygons.map((poly) => polygonPath(poly));
    model.polygons.forEach((poly, i) => {
      if (model.water[i]) return;
      const s = model.state[i] as number;
      const area = this.realmArea.get(s) ?? new Path2D();
      polygonPath(poly, area);
      this.realmArea.set(s, area);
    });
    const coast: Segment[] = [];
    const realm: Segment[] = [];
    const province: Segment[] = [];
    const edgesOf = new Map<number, Segment[]>();
    for (const e of model.edges) {
      const w1 = model.water[e.c1];
      if (e.c2 < 0) {
        // the edge of the map closes the coast rings of land that runs off it
        if (!w1) coast.push(e);
        continue;
      }
      const w2 = model.water[e.c2];
      if (w1 !== w2) { coast.push(e); continue; }
      if (w1) continue;
      const s1 = model.state[e.c1] as number, s2 = model.state[e.c2] as number;
      if (s1 !== s2) {
        realm.push(e);
        for (const s of [s1, s2]) {
          if (s <= 0) continue;
          const list = edgesOf.get(s) ?? [];
          list.push(e);
          edgesOf.set(s, list);
        }
      } else if (model.province[e.c1] !== model.province[e.c2]) province.push(e);
    }
    this.waterPath.rect(-50, -50, model.width + 100, model.height + 100);
    for (const line of chain(coast)) {
      const pts = smooth(line.points, line.closed, 3);
      addLine(this.landPath, pts, line.closed);
      addLine(this.waterPath, pts, line.closed);
      addLine(this.coastPath, pts, line.closed);
    }
    this.realmPath = linesPath(realm, 2);
    this.provincePath = linesPath(province, 2);
    for (const [s, list] of edgesOf) this.realmEdges.set(s, linesPath(list, 2));
    this.rivers = model.rivers.map((r) => ({ path: curvePath(r.points), width: r.width }));
    this.routes = model.routes.map((r) => ({ path: curvePath(r.points), group: r.group }));
    this.terrainFill = model.terrain.map((t, i) => {
      const base = TERRAIN_COLOR[model.terrains[t] ?? ''] ?? '#888888';
      return model.water[i] ? base : shade(base, (model.light[i] as number) / 160);
    });
  }

  /** The colour a map mode gives a land cell, or null for none. */
  private modeColor(mode: MapMode, i: number): string | null {
    const m = this.model;
    if (mode === 'realms') return m.states.get(m.state[i] as number)?.color ?? null;
    if (mode === 'cultures') return m.cultures.get(m.culture[i] as number)?.color ?? null;
    if (mode === 'faiths') return m.religions.get(m.religion[i] as number)?.color ?? null;
    return null;
  }

  /** Fill colour of a land cell on the paper map of a mode. */
  private paperFill(mode: MapMode, i: number): string {
    const m = this.model;
    const lit = (m.light[i] as number) / 200;
    const terrain = TERRAIN_COLOR[m.terrains[m.terrain[i] as number] ?? ''] ?? PAPER.land;
    const base = mode === 'terrain' ? mix(PAPER.land, terrain, 0.45) : mix(PAPER.land, terrain, 0.12);
    const tint = this.modeColor(mode, i);
    return shade(tint ? mix(base, tint, 0.52) : base, lit);
  }

  /** Paints the land cells of a canvas (already scaled to map units) inside the smooth coast. */
  private paintLand(ctx: CanvasRenderingContext2D, fill: (i: number) => string | null): void {
    const m = this.model;
    ctx.save();
    ctx.clip(this.landPath, 'evenodd');
    this.cellPaths.forEach((path, i) => {
      if (m.water[i]) return;
      const color = fill(i);
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fill(path);
      // seams between cells of one colour disappear under a hairline of the same colour
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.8;
      ctx.stroke(path);
    });
    ctx.restore();
  }

  /** The whole paper map of a mode, drawn once (CK3 from afar): parchment, a mode's colours, ink lines. */
  private paperCanvas(mode: MapMode): HTMLCanvasElement {
    const cached = this.paper.get(mode);
    if (cached) return cached;
    const m = this.model;
    const canvas = canvasOf(m.width * PAPER_SCALE, m.height * PAPER_SCALE);
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.setTransform(PAPER_SCALE, 0, 0, PAPER_SCALE, 0, 0);
    ctx.fillStyle = PAPER.sea;
    ctx.fillRect(0, 0, m.width, m.height);
    this.drawRipples(ctx, PAPER.ripple, 1);
    this.paintLand(ctx, (i) => this.paperFill(mode, i));
    this.drawRelief(ctx, true, null, PAPER_SCALE);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PAPER.inkSoft;
    ctx.lineWidth = 0.35;
    ctx.stroke(this.provincePath);
    ctx.strokeStyle = 'rgba(85, 110, 120, 0.75)';
    for (const r of this.rivers) {
      ctx.lineWidth = Math.max(0.25, r.width * 0.55);
      ctx.stroke(r.path);
    }
    ctx.strokeStyle = PAPER.ink;
    ctx.lineWidth = 0.9;
    ctx.stroke(this.realmPath);
    ctx.lineWidth = 0.7;
    ctx.stroke(this.coastPath);
    this.paper.set(mode, canvas);
    return canvas;
  }

  /** Thin rings of ripples along the coast on the water side (the hatched coasts of CK3's maps). */
  private drawRipples(ctx: CanvasRenderingContext2D, ink: string, unit: number): void {
    ctx.save();
    ctx.clip(this.waterPath, 'evenodd');
    ctx.lineJoin = 'round';
    for (const [w, a] of [[10, 0.45], [6.4, 0.7], [3.2, 1]] as const) {
      ctx.globalAlpha = a;
      ctx.strokeStyle = ink;
      ctx.lineWidth = w * unit;
      ctx.stroke(this.coastPath);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = (w - 0.9) * unit;
      ctx.stroke(this.coastPath);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  /**
   * Marks of the land, as a hand-drawn map has them: mountains and hills; close up also trees, marsh and fields.
   * Sizes are in screen pixels (`zoom` pixels per map unit), so marks stay marks however close the camera is.
   */
  private drawRelief(ctx: CanvasRenderingContext2D, paper: boolean, box: Box | null, zoom: number): void {
    const m = this.model;
    const ink = paper ? 'rgba(75, 58, 40, 0.55)' : 'rgba(35, 30, 22, 0.55)';
    const near = !paper && zoom >= 2.4;
    const px = 1 / zoom;
    const grow = Math.max(1, Math.min(1.8, zoom / 2.4));
    const dense = paper ? 1 : Math.max(1, Math.min(3, zoom / 2.6));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < m.cellCount; i++) {
      if (m.water[i]) continue;
      const b = m.boxes[i];
      if (box && b && (b.x1 < box.x0 || b.x0 > box.x1 || b.y1 < box.y0 || b.y0 > box.y1)) continue;
      const kind = m.terrains[m.terrain[i] as number];
      const c = m.centers[i] as Point;
      const r = rand(i);
      const spread = b ? Math.min(b.x1 - b.x0, b.y1 - b.y0) * 0.36 : 4;
      if (kind === 'mountains' || kind === 'peaks') {
        if (paper && r > 0.75) continue;
        const count = paper ? 1 : Math.round(1 + (dense - 1) * 1.2);
        for (let k = 0; k < count; k++) {
          const s = (paper ? 4.6 : Math.min(26, (kind === 'peaks' ? 13 : 11) * grow) * px) * (0.8 + rand(i * 3 + k) * 0.4);
          const x = c.x + (count > 1 ? (rand(i * 7 + k) - 0.5) * spread * 2 : (rand(i + 7) - 0.5) * 2);
          const y = c.y + (count > 1 ? (rand(i * 11 + k) - 0.5) * spread * 1.6 : (rand(i + 9) - 0.5) * 2);
          ctx.beginPath();
          ctx.moveTo(x - s, y + s * 0.55);
          ctx.lineTo(x, y - s * 0.75);
          ctx.lineTo(x + s, y + s * 0.55);
          if (!paper) {
            ctx.closePath();
            ctx.fillStyle = kind === 'peaks' ? 'rgba(236, 236, 232, 0.92)' : 'rgba(128, 120, 108, 0.6)';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x, y - s * 0.75);
            ctx.lineTo(x - s * 0.4, y + s * 0.55);
            ctx.lineTo(x - s, y + s * 0.55);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x - s, y + s * 0.55);
            ctx.lineTo(x, y - s * 0.75);
            ctx.lineTo(x + s, y + s * 0.55);
          }
          ctx.strokeStyle = ink;
          ctx.lineWidth = paper ? 0.45 : px * 1.4;
          ctx.stroke();
        }
      } else if (kind === 'hills') {
        if (paper && r > 0.55) continue;
        const count = paper ? 1 : Math.round(dense);
        for (let k = 0; k < count; k++) {
          const s = paper ? 2.6 : Math.min(16, 8 * grow) * px * (0.85 + rand(i * 5 + k) * 0.3);
          const x = c.x + (count > 1 ? (rand(i * 13 + k) - 0.5) * spread * 2 : 0);
          const y = c.y + (count > 1 ? (rand(i * 17 + k) - 0.5) * spread * 1.6 : 0);
          ctx.beginPath();
          ctx.arc(x, y + s * 0.5, s, Math.PI * 1.1, Math.PI * 1.9);
          ctx.strokeStyle = ink;
          ctx.lineWidth = paper ? 0.4 : px * 1.3;
          ctx.stroke();
        }
      } else if (near && (kind === 'forest' || kind === 'taiga' || kind === 'jungle')) {
        const n = Math.round((3 + r * 3) * dense);
        ctx.fillStyle = kind === 'jungle' ? 'rgba(28, 66, 32, 0.55)' : kind === 'taiga' ? 'rgba(34, 56, 40, 0.6)' : 'rgba(40, 62, 30, 0.5)';
        for (let k = 0; k < n; k++) {
          const x = c.x + (rand(i * 31 + k) - 0.5) * spread * 2.2, y = c.y + (rand(i * 17 + k) - 0.5) * spread * 2.2;
          const s = (3 + rand(i * 13 + k) * 2) * px * Math.min(1.5, grow);
          ctx.beginPath();
          if (kind === 'taiga') {
            ctx.moveTo(x, y - s * 1.7);
            ctx.lineTo(x - s, y + s * 0.6);
            ctx.lineTo(x + s, y + s * 0.6);
            ctx.closePath();
          } else ctx.arc(x, y, s, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (near && kind === 'wetlands') {
        ctx.strokeStyle = 'rgba(60, 90, 100, 0.5)';
        ctx.lineWidth = px * 1.1;
        for (let k = 0; k < Math.round(3 * dense); k++) {
          const x = c.x + (rand(i * 7 + k) - 0.5) * spread * 2, y = c.y + (rand(i * 5 + k) - 0.5) * spread * 2;
          ctx.beginPath();
          ctx.moveTo(x - 5 * px, y);
          ctx.lineTo(x + 5 * px, y);
          ctx.stroke();
        }
      } else if (near && kind === 'farmlands') {
        ctx.strokeStyle = 'rgba(120, 100, 50, 0.32)';
        ctx.lineWidth = px * 1;
        const a = rand(i) * Math.PI;
        const dx = Math.cos(a) * spread * 0.9, dy = Math.sin(a) * spread * 0.9;
        for (let k = -2; k <= 2; k++) {
          const ox = -Math.sin(a) * spread * 0.18 * k, oy = Math.cos(a) * spread * 0.18 * k;
          ctx.beginPath();
          ctx.moveTo(c.x - dx + ox, c.y - dy + oy);
          ctx.lineTo(c.x + dx + ox, c.y + dy + oy);
          ctx.stroke();
        }
      }
    }
  }

  /**
   * The terrain close up, drawn once: land cells in their colours, softened so the cells melt into each other as a
   * painted map does (CK3), cut along the smooth coast; one sea colour, lighter by the shore, with ripples; rivers.
   */
  private baseCanvas(ribbons: boolean): HTMLCanvasElement {
    const cached = this.bases.get(ribbons);
    if (cached) return cached;
    const m = this.model;
    const scale = BASE_SCALE;
    const raw = canvasOf(m.width * scale, m.height * scale);
    const canvas = canvasOf(m.width * scale, m.height * scale);
    const rctx = raw.getContext('2d');
    const ctx = canvas.getContext('2d');
    if (!rctx || !ctx) return canvas;
    rctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.cellPaths.forEach((path, i) => {
      // water cells take the colour of their land neighbours' edge after the blur only inside the coast clip below
      rctx.fillStyle = m.water[i] ? (TERRAIN_COLOR.plains ?? '#9caa69') : (this.terrainFill[i] as string);
      rctx.fill(path);
      rctx.strokeStyle = rctx.fillStyle;
      rctx.lineWidth = 1.2;
      rctx.stroke(path);
    });
    ctx.fillStyle = TERRAIN_COLOR.sea ?? '#355670';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.save();
    ctx.clip(this.waterPath, 'evenodd');
    ctx.filter = `blur(${Math.round(7 * scale)}px)`;
    ctx.strokeStyle = TERRAIN_COLOR.shallows ?? '#466b82';
    ctx.lineWidth = 16;
    ctx.stroke(this.coastPath);
    ctx.filter = 'none';
    ctx.restore();
    this.drawRipples(ctx, INK.ripple, 0.9);
    ctx.save();
    ctx.clip(this.landPath, 'evenodd');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = `blur(${Math.round(1.8 * scale)}px)`;
    ctx.drawImage(raw, 0, 0);
    ctx.filter = 'none';
    ctx.restore();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK.river;
    for (const r of this.rivers) {
      ctx.lineWidth = Math.max(0.45, r.width * 0.6);
      ctx.stroke(r.path);
    }
    if (ribbons) this.drawRibbons(ctx);
    this.bases.set(ribbons, canvas);
    return canvas;
  }

  /** A map mode's colours over the land (cultures, faiths), drawn once, soft. */
  private tintCanvas(mode: MapMode): HTMLCanvasElement | null {
    if (mode !== 'cultures' && mode !== 'faiths') return null;
    const cached = this.tints.get(mode);
    if (cached) return cached;
    const m = this.model;
    const canvas = canvasOf(m.width * 1.5, m.height * 1.5);
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.setTransform(1.5, 0, 0, 1.5, 0, 0);
    this.paintLand(ctx, (i) => this.modeColor(mode, i));
    this.tints.set(mode, canvas);
    return canvas;
  }

  /** The realms' colours as ribbons inside their borders (CK3), into a canvas scaled to map units. */
  private drawRibbons(ctx: CanvasRenderingContext2D): void {
    const m = this.model;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [s, edges] of this.realmEdges) {
      const color = m.states.get(s)?.color;
      const area = this.realmArea.get(s);
      if (!color || !area) continue;
      ctx.save();
      ctx.clip(area);
      ctx.clip(this.landPath, 'evenodd');
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 3;
      ctx.stroke(edges);
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 6.5;
      ctx.stroke(edges);
      ctx.restore();
    }
  }

  /** Draws the part of a cached picture of the whole map that is on the screen. */
  private blit(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, box: Box): void {
    const m = this.model;
    const sx = image.width / m.width, sy = image.height / m.height;
    const x0 = Math.max(0, box.x0), y0 = Math.max(0, box.y0), x1 = Math.min(m.width, box.x1), y1 = Math.min(m.height, box.y1);
    if (x1 <= x0 || y1 <= y0) return;
    ctx.drawImage(image, x0 * sx, y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy, x0, y0, x1 - x0, y1 - y0);
  }

  /** The terrain close up: the cached base, a mode's colours, and the marks of the land on the screen. */
  private drawTerrain(ctx: CanvasRenderingContext2D, mode: MapMode, box: Box, zoom: number): void {
    ctx.imageSmoothingQuality = 'high';
    this.blit(ctx, this.baseCanvas(mode === 'realms' || mode === 'roads'), box);
    const tint = this.tintCanvas(mode);
    if (tint) {
      ctx.globalAlpha = 0.5;
      this.blit(ctx, tint, box);
      ctx.globalAlpha = 1;
    }
    this.drawRelief(ctx, false, box, zoom);
  }

  /** Province and realm borders and the coast close up, crisp at any zoom. */
  private drawBorders(ctx: CanvasRenderingContext2D, zoom: number): void {
    const px = 1 / zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([px * 5, px * 4]);
    ctx.strokeStyle = INK.province;
    ctx.lineWidth = px * 1.1;
    ctx.stroke(this.provincePath);
    ctx.setLineDash([]);
    ctx.strokeStyle = INK.realm;
    ctx.lineWidth = px * 1.9;
    ctx.stroke(this.realmPath);
    ctx.strokeStyle = INK.coast;
    ctx.lineWidth = px * 1.5;
    ctx.stroke(this.coastPath);
  }

  private drawRoutes(ctx: CanvasRenderingContext2D, zoom: number, paperAlpha: number): void {
    const px = 1 / zoom;
    ctx.lineCap = 'round';
    for (const r of this.routes) {
      if (r.group === 'searoutes') {
        if (zoom < 2) continue;
        ctx.strokeStyle = INK.sea;
        ctx.setLineDash([px * 2, px * 6]);
        ctx.lineWidth = px * 1.3;
      } else if (r.group === 'roads') {
        ctx.strokeStyle = INK.road;
        ctx.setLineDash([px * 7, px * 4]);
        ctx.lineWidth = px * 1.7;
      } else {
        if (zoom < 2.2) continue;
        ctx.strokeStyle = INK.trail;
        ctx.setLineDash([px * 2, px * 4]);
        ctx.lineWidth = px * 1.2;
      }
      ctx.globalAlpha = 1 - paperAlpha;
      ctx.stroke(r.path);
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  /** Towns of the map that are not places of the game: small marks close up. */
  private drawBurgs(ctx: CanvasRenderingContext2D, zoom: number, places: Set<string>, box: Box): void {
    if (zoom < 2.2) return;
    const px = 1 / zoom;
    for (const b of this.model.burgs) {
      if (places.has(b.name) || b.x < box.x0 || b.x > box.x1 || b.y < box.y0 || b.y > box.y1) continue;
      const r = (b.capital ? 4.6 : 3.4) * px * Math.min(1.6, zoom / 2.2);
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#efe6d2';
      ctx.fill();
      ctx.strokeStyle = INK.label;
      ctx.lineWidth = px * 1.2;
      ctx.stroke();
    }
  }

  /** The places of the game, the roads between them in the roads mode, the hero and his journey. */
  private drawOverlay(ctx: CanvasRenderingContext2D, mode: MapMode, overlay: MapOverlay, zoom: number): void {
    const px = 1 / zoom;
    if (mode === 'roads') {
      ctx.lineCap = 'round';
      for (const r of overlay.roads) {
        ctx.strokeStyle = 'rgba(70, 40, 18, 0.9)';
        ctx.lineWidth = px * 4;
        ctx.beginPath();
        ctx.moveTo(r.a.x, r.a.y);
        ctx.lineTo(r.b.x, r.b.y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(240, 220, 170, 0.95)';
        ctx.lineWidth = px * 1.8;
        ctx.stroke();
      }
    }
    if (overlay.journey) {
      ctx.strokeStyle = 'rgba(150, 30, 20, 0.95)';
      ctx.lineWidth = px * 2.8;
      ctx.setLineDash([px * 9, px * 6]);
      ctx.beginPath();
      ctx.moveTo(overlay.journey.from.x, overlay.journey.from.y);
      ctx.lineTo(overlay.journey.to.x, overlay.journey.to.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const p of overlay.places) {
      const big = p.kind === 'city';
      const r = (big ? 6 : p.kind === 'town' ? 5 : 4.2) * px * Math.max(1, Math.min(1.6, zoom / 1.8));
      const active = p.id === overlay.selected || p.id === overlay.hovered;
      ctx.beginPath();
      if (big) ctx.rect(p.at.x - r, p.at.y - r, r * 2, r * 2);
      else ctx.arc(p.at.x, p.at.y, r, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#fff3cf' : '#f1e7cf';
      ctx.fill();
      ctx.strokeStyle = '#2a2017';
      ctx.lineWidth = px * (active ? 2.6 : 1.8);
      ctx.stroke();
      if (big) {
        ctx.fillStyle = '#2a2017';
        ctx.fillRect(p.at.x - r * 0.35, p.at.y - r * 0.35, r * 0.7, r * 0.7);
      }
    }
    if (overlay.hero) {
      const { x, y } = overlay.hero;
      const s = 9 * px;
      // a banner on a pole: where the hero is
      ctx.strokeStyle = '#1d140c';
      ctx.lineWidth = px * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - s * 2.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - s * 2.4);
      ctx.lineTo(x + s * 1.5, y - s * 2);
      ctx.lineTo(x, y - s * 1.55);
      ctx.closePath();
      ctx.fillStyle = '#9b2a1c';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, px * 3, 0, Math.PI * 2);
      ctx.fillStyle = '#1d140c';
      ctx.fill();
    }
  }

  /** Draws the whole map for the camera into a canvas of the viewport size (device pixel ratio `dpr`). */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, view: Viewport, dpr: number, mode: MapMode, overlay: MapOverlay): void {
    const m = this.model;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER.seaDeep;
    ctx.fillRect(0, 0, view.width, view.height);
    const z = cam.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (view.width / 2 - cam.x * z), dpr * (view.height / 2 - cam.y * z));
    const box = visibleBox(cam, view, 12);
    const paperAlpha = z <= PAPER_FROM ? 1 : z >= PAPER_TO ? 0 : (PAPER_TO - z) / (PAPER_TO - PAPER_FROM);
    if (paperAlpha < 1) {
      this.drawTerrain(ctx, mode, box, z);
      this.drawBorders(ctx, z);
    }
    if (paperAlpha > 0) {
      ctx.globalAlpha = paperAlpha;
      ctx.imageSmoothingQuality = 'high';
      this.blit(ctx, this.paperCanvas(mode), box);
      ctx.globalAlpha = 1;
    }
    this.drawRoutes(ctx, z, paperAlpha);
    this.drawBurgs(ctx, z, new Set(overlay.places.map((p) => p.name)), box);
    this.drawOverlay(ctx, mode, overlay, z);
    drawLabels(ctx, m, z, paperAlpha, overlay, box);
  }
}
