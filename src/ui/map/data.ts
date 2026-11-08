import raw from './region-map.json?raw';

/** The map of the screen as `tools/map-build.ts` writes it (M.1): coordinates in tenths of a map unit. */
export interface MapFile {
  v: number;
  width: number;
  height: number;
  terrains: string[];
  vx: number[];
  cells: { v: number[][]; x: number[]; y: number[]; h: number[]; t: number[]; l: number[]; p: number[]; s: number[]; c: number[]; r: number[] };
  rivers: { name: string; width: number; points: number[] }[];
  routes: { group: string; points: number[] }[];
  burgs: { id: number; name: string; x: number; y: number; state: number; province: number; capital: number; port: number; population: number; type: string; walls: number; temple: number }[];
  states: { id: number; name: string; fullName: string; color: string; label: number[] | null }[];
  provinces: { id: number; name: string; fullName: string; state: number; color: string; x: number; y: number }[];
  cultures: { id: number; name: string; color: string }[];
  religions: { id: number; name: string; color: string }[];
  seas: { name: string; label: number[] | null }[];
}

export interface Point {
  x: number;
  y: number;
}

/** A side shared by two cells: the borders are drawn along these. */
export interface Edge {
  a: Point;
  b: Point;
  /** Cell on one side, and on the other (-1 at the edge of the map). */
  c1: number;
  c2: number;
}

/** Everything the drawing needs, in map units (not tenths), worked out once. */
export interface MapModel {
  width: number;
  height: number;
  terrains: string[];
  cellCount: number;
  /** Corners of each cell. */
  polygons: Point[][];
  /** Bounding box of each cell, for culling. */
  boxes: { x0: number; y0: number; x1: number; y1: number }[];
  centers: Point[];
  elevation: number[];
  terrain: number[];
  light: number[];
  province: number[];
  state: number[];
  culture: number[];
  religion: number[];
  water: boolean[];
  edges: Edge[];
  rivers: { name: string; width: number; points: Point[] }[];
  routes: { group: string; points: Point[] }[];
  burgs: MapFile['burgs'];
  states: Map<number, MapFile['states'][number]>;
  provinces: Map<number, MapFile['provinces'][number]>;
  cultures: Map<number, MapFile['cultures'][number]>;
  religions: Map<number, MapFile['religions'][number]>;
  seas: MapFile['seas'];
  /** Cells on a coarse grid, for finding the cell under the pointer. */
  grid: { size: number; cols: number; rows: number; cells: number[][] };
}

const WATER = new Set(['deep_sea', 'sea', 'shallows', 'lake']);

function pointsOf(flat: number[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: (flat[i] as number) / 10, y: (flat[i + 1] as number) / 10 });
  return out;
}

export function buildModel(file: MapFile): MapModel {
  const vx = file.vx;
  const vertex = (i: number): Point => ({ x: (vx[i * 2] as number) / 10, y: (vx[i * 2 + 1] as number) / 10 });
  const n = file.cells.v.length;
  const polygons = file.cells.v.map((vs) => vs.map(vertex));
  const boxes = polygons.map((poly) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return { x0, y0, x1, y1 };
  });
  const terrain = file.cells.t;
  const water = terrain.map((t) => WATER.has(file.terrains[t] ?? ''));

  // each side of a cell polygon, keyed by its two corners, shared by at most two cells
  const sides = new Map<string, Edge>();
  file.cells.v.forEach((vs, cell) => {
    for (let k = 0; k < vs.length; k++) {
      const a = vs[k] as number;
      const b = vs[(k + 1) % vs.length] as number;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const found = sides.get(key);
      if (found) found.c2 = cell;
      else sides.set(key, { a: vertex(a), b: vertex(b), c1: cell, c2: -1 });
    }
  });

  const size = 25;
  const cols = Math.ceil(file.width / size);
  const rows = Math.ceil(file.height / size);
  const gridCells: number[][] = Array.from({ length: cols * rows }, () => []);
  boxes.forEach((b, cell) => {
    for (let gx = Math.max(0, Math.floor(b.x0 / size)); gx <= Math.min(cols - 1, Math.floor(b.x1 / size)); gx++) {
      for (let gy = Math.max(0, Math.floor(b.y0 / size)); gy <= Math.min(rows - 1, Math.floor(b.y1 / size)); gy++) gridCells[gy * cols + gx]?.push(cell);
    }
  });

  return {
    width: file.width,
    height: file.height,
    terrains: file.terrains,
    cellCount: n,
    polygons,
    boxes,
    centers: file.cells.x.map((x, i) => ({ x: x / 10, y: (file.cells.y[i] as number) / 10 })),
    elevation: file.cells.h,
    terrain,
    light: file.cells.l,
    province: file.cells.p,
    state: file.cells.s,
    culture: file.cells.c,
    religion: file.cells.r,
    water,
    edges: [...sides.values()],
    rivers: file.rivers.map((r) => ({ name: r.name, width: r.width / 10, points: pointsOf(r.points) })),
    routes: file.routes.map((r) => ({ group: r.group, points: pointsOf(r.points) })),
    burgs: file.burgs.map((b) => ({ ...b, x: b.x / 10, y: b.y / 10 })),
    states: new Map(file.states.map((s) => [s.id, { ...s, label: s.label ? s.label.map((v) => v / 10) : null }])),
    provinces: new Map(file.provinces.map((p) => [p.id, { ...p, x: p.x / 10, y: p.y / 10 }])),
    cultures: new Map(file.cultures.map((c) => [c.id, c])),
    religions: new Map(file.religions.map((r) => [r.id, r])),
    seas: file.seas.map((s) => ({ ...s, label: s.label ? s.label.map((v) => v / 10) : null })),
    grid: { size, cols, rows, cells: gridCells },
  };
}

/** Whether a point lies inside a polygon (even-odd rule). */
export function inside(p: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Point, b = poly[j] as Point;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** The cell under a point of the map, or -1. */
export function cellAt(model: MapModel, p: Point): number {
  const { size, cols, rows, cells } = model.grid;
  const gx = Math.floor(p.x / size), gy = Math.floor(p.y / size);
  if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return -1;
  for (const c of cells[gy * cols + gx] ?? []) if (inside(p, model.polygons[c] as Point[])) return c;
  return -1;
}

let model: MapModel | null = null;

/** The map of the region, parsed on first use. */
export function regionModel(): MapModel {
  if (!model) model = buildModel(JSON.parse(raw) as MapFile);
  return model;
}
