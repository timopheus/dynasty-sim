/**
 * Builds the map of the screen (M.1, D-469) from the Azgaar export `map/region.json`: a compact, deterministic file for
 * the interface, `src/ui/map/region-map.json`. Run: `npm run map-build`; `--check` fails when the file in the repository
 * differs from a fresh build.
 *
 * What goes in: the corners of the Voronoi cells and, per cell, its corners, height, kind of land (after the terrain
 * types of CK3), light from the north-west, province, realm, culture and faith; rivers and roads as lines; towns; and
 * where to write the names of realms, provinces and seas. Coordinates are in tenths of a map unit, as integers.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'map/region.json');
export const TARGET = join(ROOT, 'src/ui/map/region-map.json');

interface AzCell { i: number; v: number[]; c: number[]; p: [number, number]; h: number; t: number; f: number; biome: number; r: number; pop: number; culture: number; state: number; religion: number; province: number; burg: number; harbor: number }
interface AzVertex { p: [number, number] }
interface AzFeature { i: number; type: string; land: boolean; name?: string; cells?: number }
interface AzBurg { i: number; cell: number; x: number; y: number; name: string; state: number; province?: number; culture: number; capital: number; port: number; population: number; type: string; citadel?: number; walls?: number; temple?: number; removed?: boolean }
interface AzState { i: number; name: string; fullName?: string; color?: string; pole?: [number, number]; removed?: boolean }
interface AzProvince { i: number; name: string; fullName?: string; state: number; color?: string; pole?: [number, number]; burg?: number; removed?: boolean }
interface AzNamed { i: number; name: string; color?: string; removed?: boolean }
interface AzRiver { i: number; cells: number[]; width?: number; discharge?: number; name?: string; type?: string }
interface AzRoute { i: number; group: string; points: [number, number, number][] }
interface AzZone { name: string; type: string; cells: number[] }
interface AzMap {
  info: { width: number; height: number };
  pack: {
    cells: AzCell[]; vertices: AzVertex[]; features: (AzFeature | number)[]; burgs: AzBurg[]; states: AzState[];
    provinces: (AzProvince | number)[]; cultures: AzNamed[]; religions: AzNamed[]; rivers: AzRiver[]; routes: AzRoute[]; zones: AzZone[];
  };
}

/**
 * Kinds of land, after the terrain types of CK3; water first. The order is the code in the file (`ct`).
 * The colours are ours (D-469), chosen in `src/ui/map/terrain.ts`.
 */
export const TERRAINS = [
  'deep_sea', 'sea', 'shallows', 'lake',
  'plains', 'farmlands', 'floodplains', 'drylands', 'steppe', 'desert', 'forest', 'taiga', 'jungle', 'wetlands', 'tundra', 'hills', 'mountains', 'peaks', 'glacier',
] as const;
type Terrain = (typeof TERRAINS)[number];

/** Azgaar biomes: 0 marine, 1 hot desert, 2 cold desert, 3 savanna, 4 grassland, 5 tropical seasonal forest,
 * 6 temperate deciduous forest, 7 tropical rainforest, 8 temperate rainforest, 9 taiga, 10 tundra, 11 glacier, 12 wetland. */
function terrainOf(c: AzCell, feature: AzFeature | undefined, farmPop: number, openPop: number): Terrain {
  if (c.h < 20) {
    if (feature?.type === 'lake') return 'lake';
    if (c.t === -1) return 'shallows';
    if (c.t === -2) return 'sea';
    return 'deep_sea';
  }
  if (c.biome === 11) return 'glacier';
  if (c.h >= 80) return 'peaks';
  if (c.h >= 64) return 'mountains';
  if (c.h >= 50 && c.biome !== 12) return 'hills';
  switch (c.biome) {
    case 1: return 'desert';
    case 2: return 'drylands';
    case 3: return 'drylands';
    case 4: return c.r > 0 ? 'floodplains' : c.pop >= farmPop ? 'farmlands' : 'plains';
    // settled land is cleared: fields near the crowded cells, open country around them, wild forest beyond
    case 5: case 6: case 8: return c.pop >= farmPop && c.h < 45 ? 'farmlands' : c.pop >= openPop ? 'plains' : 'forest';
    case 7: return c.pop >= farmPop ? 'farmlands' : 'jungle';
    case 9: return c.pop >= farmPop ? 'plains' : 'taiga';
    case 10: return 'tundra';
    // Azgaar's wetland covers wide wet lowlands: marsh only by rivers and shores, elsewhere wet meadow or wood
    case 12: return c.h < 28 && (c.r > 0 || c.t === 1) ? (c.r > 0 && c.pop >= openPop ? 'floodplains' : 'wetlands') : c.pop >= openPop ? 'plains' : 'forest';
    default: return 'plains';
  }
}

const tenth = (n: number) => Math.round(n * 10);
const isLive = <T extends { removed?: boolean }>(x: T | number | undefined): x is T => typeof x === 'object' && x !== null && !x.removed;

/** Principal axis of a set of weighted points: the line a curved name of a realm follows (CK3 writes realms along their shape). */
function labelLine(points: { x: number; y: number; w: number }[], anchor: [number, number] | undefined): number[] | null {
  const total = points.reduce((s, p) => s + p.w, 0);
  if (total === 0) return null;
  const mx = points.reduce((s, p) => s + p.x * p.w, 0) / total;
  const my = points.reduce((s, p) => s + p.y * p.w, 0) / total;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of points) {
    sxx += p.w * (p.x - mx) ** 2;
    syy += p.w * (p.y - my) ** 2;
    sxy += p.w * (p.x - mx) * (p.y - my);
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let dx = Math.cos(angle), dy = Math.sin(angle);
  if (dx < 0) { dx = -dx; dy = -dy; }
  // names are written fairly level, as in CK3: steep realms get a gentler slope
  const maxSlope = 0.6;
  if (Math.abs(dy / dx) > maxSlope) { const s = Math.sign(dy) * maxSlope; const n = Math.hypot(1, s); dx = 1 / n; dy = s / n; }
  const [cx, cy] = anchor ?? [mx, my];
  const along = points.map((p) => (p.x - cx) * dx + (p.y - cy) * dy);
  const lo = quantile(along, 0.12), hi = quantile(along, 0.88);
  const half = Math.max(8, (hi - lo) / 2) * 0.82;
  const mid = (lo + hi) / 2;
  const sx = cx + dx * mid, sy = cy + dy * mid;
  // a slight bend toward the side where the land lies, as hand-lettered map names do
  const nx = -dy, ny = dx;
  const across = points.reduce((s, p) => s + ((p.x - sx) * nx + (p.y - sy) * ny) * p.w, 0) / total;
  const bend = Math.max(-half * 0.25, Math.min(half * 0.25, across * 0.6));
  return [sx - dx * half, sy - dy * half, sx + nx * bend, sy + ny * bend, sx + dx * half, sy + dy * half].map(tenth);
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))] ?? 0;
}

export function buildMap(az: AzMap): unknown {
  const { cells, vertices, burgs, states, provinces, cultures, religions, rivers, routes, zones } = az.pack;
  const features = new Map<number, AzFeature>();
  for (const f of az.pack.features) if (typeof f === 'object' && f) features.set(f.i, f);
  const landPops = cells.filter((c) => c.h >= 20).map((c) => c.pop).sort((a, b) => a - b);
  const farmPop = landPops[Math.floor(landPops.length * 0.82)] ?? 20;
  const openPop = landPops[Math.floor(landPops.length * 0.55)] ?? 10;

  // light from the north-west: the slope of the height toward the neighbours
  const light = cells.map((c) => {
    if (c.h < 20) return 0;
    let gx = 0, gy = 0, n = 0;
    for (const j of c.c) {
      const o = cells[j];
      if (!o) continue;
      const dx = o.p[0] - c.p[0], dy = o.p[1] - c.p[1];
      const d = Math.hypot(dx, dy) || 1;
      const dh = Math.max(o.h, 18) - c.h;
      gx += (dh * dx) / d; gy += (dh * dy) / d; n += 1;
    }
    if (n === 0) return 0;
    // a cell whose north-west neighbours are higher lies in shade
    const shade = ((gx + gy) / n) * -1;
    return Math.max(-60, Math.min(60, Math.round(shade * 2.2)));
  });

  const realmPoints = new Map<number, { x: number; y: number; w: number }[]>();
  for (const c of cells) {
    if (c.h < 20 || c.state <= 0) continue;
    const list = realmPoints.get(c.state) ?? [];
    list.push({ x: c.p[0], y: c.p[1], w: 1 });
    realmPoints.set(c.state, list);
  }

  const out = {
    v: 1,
    width: az.info.width,
    height: az.info.height,
    terrains: TERRAINS,
    vx: vertices.flatMap((v) => [tenth(v.p[0]), tenth(v.p[1])]),
    cells: {
      v: cells.map((c) => c.v),
      x: cells.map((c) => tenth(c.p[0])),
      y: cells.map((c) => tenth(c.p[1])),
      h: cells.map((c) => c.h),
      t: cells.map((c) => TERRAINS.indexOf(terrainOf(c, features.get(c.f), farmPop, openPop))),
      l: light,
      p: cells.map((c) => c.province),
      s: cells.map((c) => c.state),
      c: cells.map((c) => c.culture),
      r: cells.map((c) => c.religion),
    },
    rivers: rivers.filter((r) => r.cells.length > 1).map((r) => ({
      name: r.name ?? '',
      width: Math.round(Math.max(0.3, Math.min(4, (r.width ?? 0.4) * 2.2)) * 10),
      points: r.cells.filter((i) => i >= 0 && cells[i]).flatMap((i) => [tenth((cells[i] as AzCell).p[0]), tenth((cells[i] as AzCell).p[1])]),
    })).filter((r) => r.points.length >= 4),
    routes: routes.map((r) => ({ group: r.group, points: r.points.flatMap((p) => [tenth(p[0]), tenth(p[1])]) })),
    burgs: burgs.filter(isLive).filter((b) => b.i > 0).map((b) => ({
      id: b.i, name: b.name, x: tenth(b.x), y: tenth(b.y), state: b.state, province: (cells[b.cell] as AzCell | undefined)?.province ?? 0,
      capital: b.capital ? 1 : 0, port: b.port ? 1 : 0, population: Math.round(b.population * 1000), type: b.type,
      walls: b.walls ? 1 : 0, temple: b.temple ? 1 : 0,
    })),
    states: states.filter(isLive).filter((s) => s.i > 0).map((s) => ({
      id: s.i, name: s.name, fullName: s.fullName ?? s.name, color: s.color ?? '#999999',
      label: labelLine(realmPoints.get(s.i) ?? [], s.pole),
    })),
    provinces: provinces.filter(isLive).filter((p) => p.i > 0).map((p) => ({
      id: p.i, name: p.name, fullName: p.fullName ?? p.name, state: p.state, color: p.color ?? '#999999',
      x: tenth((p.pole ?? [0, 0])[0]), y: tenth((p.pole ?? [0, 0])[1]),
    })),
    cultures: cultures.filter(isLive).map((c) => ({ id: c.i, name: c.name, color: c.color ?? '#9a9a9a' })),
    religions: religions.filter(isLive).map((r) => ({ id: r.i, name: r.name, color: r.color ?? '#9a9a9a' })),
    seas: zones.filter((z) => z.type === 'Sea' && z.cells.length > 0).map((z) => {
      const pts = z.cells.map((i) => cells[i]).filter((c): c is AzCell => !!c).map((c) => ({ x: c.p[0], y: c.p[1], w: 1 }));
      return { name: z.name, label: labelLine(pts, undefined) };
    }),
  };
  return out;
}

function main(): void {
  const az = JSON.parse(readFileSync(SOURCE, 'utf8')) as AzMap;
  const text = `${JSON.stringify(buildMap(az))}\n`;
  if (process.argv.includes('--check')) {
    const current = readFileSync(TARGET, 'utf8');
    if (current !== text) {
      console.error('src/ui/map/region-map.json is stale: run `npm run map-build`');
      process.exit(1);
    }
    console.log('map data up to date');
    return;
  }
  writeFileSync(TARGET, text);
  console.log(`wrote ${TARGET} (${Math.round(text.length / 1024)} KB)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
