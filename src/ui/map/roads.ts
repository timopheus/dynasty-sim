import { smooth } from './geometry';
import type { MapModel, Point } from './model';

/**
 * The roads of the game drawn along the roads of the map (M.1): a road between two places follows the map's roads,
 * trails and sea lanes by the shortest way, so the hero walks where the map shows a road, not across country.
 * Pure; the graph and the ways are made once per map and kept in a cache that is never stored.
 */

/** How much longer a stretch counts than its length, by the kind of the map's route: roads first, then trails, then the sea. */
const COST: Record<string, number> = { roads: 1, trails: 1.35, searoutes: 1.8 };

/** A place farther than this from every point of a route (map units) is joined to the way by a straight line. */
const REACH = 12;

interface Graph {
  nodes: Point[];
  edges: { to: number; cost: number }[][];
}

const GRAPHS = new WeakMap<MapModel, Graph>();
const WAYS = new WeakMap<MapModel, Map<string, Point[]>>();

const keyOf = (p: Point) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;

function graphOf(model: MapModel): Graph {
  const known = GRAPHS.get(model);
  if (known) return known;
  const index = new Map<string, number>();
  const graph: Graph = { nodes: [], edges: [] };
  const node = (p: Point) => {
    const k = keyOf(p);
    let i = index.get(k);
    if (i === undefined) {
      i = graph.nodes.length;
      index.set(k, i);
      graph.nodes.push(p);
      graph.edges.push([]);
    }
    return i;
  };
  for (const route of model.routes) {
    const factor = COST[route.group] ?? 1.5;
    for (let j = 1; j < route.points.length; j++) {
      const a = node(route.points[j - 1] as Point), b = node(route.points[j] as Point);
      if (a === b) continue;
      const pa = graph.nodes[a] as Point, pb = graph.nodes[b] as Point;
      const cost = Math.hypot(pa.x - pb.x, pa.y - pb.y) * factor;
      (graph.edges[a] as Graph['edges'][number]).push({ to: b, cost });
      (graph.edges[b] as Graph['edges'][number]).push({ to: a, cost });
    }
  }
  GRAPHS.set(model, graph);
  return graph;
}

function nearest(graph: Graph, p: Point): number | null {
  let best: number | null = null;
  let bestD = REACH;
  graph.nodes.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}

/** Shortest way between two nodes (Dijkstra over a binary heap); null when the map's routes do not join them. */
function shortest(graph: Graph, from: number, to: number): number[] | null {
  const dist = new Float64Array(graph.nodes.length).fill(Infinity);
  const prev = new Int32Array(graph.nodes.length).fill(-1);
  const heap: [number, number][] = [[0, from]];
  dist[from] = 0;
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if ((heap[up] as [number, number])[0] <= item[0]) break;
      heap[i] = heap[up] as [number, number];
      i = up;
    }
    heap[i] = item;
  };
  const pop = (): [number, number] => {
    const top = heap[0] as [number, number];
    const last = heap.pop() as [number, number];
    if (heap.length > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        const val = (k: number) => (k === i ? last[0] : (heap[k] as [number, number])[0]);
        if (l < heap.length && val(l) < val(m)) m = l;
        if (r < heap.length && val(r) < val(m)) m = r;
        if (m === i) break;
        heap[i] = heap[m] as [number, number];
        i = m;
      }
      heap[i] = last;
    }
    return top;
  };
  while (heap.length > 0) {
    const [d, at] = pop();
    if (d > (dist[at] as number)) continue;
    if (at === to) break;
    for (const e of graph.edges[at] as Graph['edges'][number]) {
      const nd = d + e.cost;
      if (nd < (dist[e.to] as number)) {
        dist[e.to] = nd;
        prev[e.to] = at;
        push([nd, e.to]);
      }
    }
  }
  if (!Number.isFinite(dist[to] as number)) return null;
  const way: number[] = [];
  for (let at = to; at !== -1; at = prev[at] as number) way.unshift(at);
  return way;
}

/** The way along the map's routes from one point to another (both ends included); a straight line when there is none. */
export function wayBetween(model: MapModel, a: Point, b: Point): Point[] {
  let cache = WAYS.get(model);
  if (!cache) { cache = new Map(); WAYS.set(model, cache); }
  const key = `${keyOf(a)}>${keyOf(b)}`;
  const known = cache.get(key);
  if (known) return known;
  const back = cache.get(`${keyOf(b)}>${keyOf(a)}`);
  if (back) {
    const way = [...back].reverse();
    cache.set(key, way);
    return way;
  }
  const graph = graphOf(model);
  const from = nearest(graph, a), to = nearest(graph, b);
  const nodes = from !== null && to !== null ? shortest(graph, from, to) : null;
  const way = nodes ? [a, ...nodes.map((i) => graph.nodes[i] as Point), b] : [a, b];
  // a point joined twice (a place on a route node) is dropped
  const clean = way.filter((p, i) => i === 0 || Math.hypot(p.x - (way[i - 1] as Point).x, p.y - (way[i - 1] as Point).y) > 0.01);
  // smooth once, so the line drawn and the point the hero stands at are the same line
  const soft = smooth(clean, false, 2);
  cache.set(key, soft);
  return soft;
}

export function lengthOf(way: Point[]): number {
  let sum = 0;
  for (let i = 1; i < way.length; i++) sum += Math.hypot((way[i] as Point).x - (way[i - 1] as Point).x, (way[i] as Point).y - (way[i - 1] as Point).y);
  return sum;
}

/** The part of a way between two shares of its length (0 — its start, 1 — its end). */
export function partOf(way: Point[], from: number, to: number): Point[] {
  const total = lengthOf(way);
  if (way.length < 2 || total === 0) return way.slice();
  const s0 = Math.max(0, Math.min(1, from)) * total, s1 = Math.max(0, Math.min(1, to)) * total;
  const out: Point[] = [];
  let run = 0;
  for (let i = 1; i < way.length; i++) {
    const p = way[i - 1] as Point, q = way[i] as Point;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const at = (s: number) => ({ x: p.x + ((q.x - p.x) * (s - run)) / (len || 1), y: p.y + ((q.y - p.y) * (s - run)) / (len || 1) });
    if (out.length === 0 && s0 <= run + len) out.push(at(Math.max(s0, run)));
    if (out.length > 0) {
      if (s1 <= run + len) { out.push(at(s1)); break; }
      out.push(q);
    }
    run += len;
  }
  return out;
}

/** The point at a share of a way's length. */
export function pointOf(way: Point[], share: number): Point {
  const part = partOf(way, share, share);
  return part[0] ?? way[0] ?? { x: 0, y: 0 };
}
