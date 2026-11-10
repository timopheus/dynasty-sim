import type { Point } from './model';

/** A side of a cell as a segment, by the keys of its two corners. */
export interface Segment {
  a: Point;
  b: Point;
}

const key = (p: Point) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;

/**
 * Joins segments that share corners into lines: closed rings where they close (a coast), open lines otherwise (a
 * border between two junctions). Greedy and deterministic: the order of the segments decides where a line starts.
 */
export function chain(segments: Segment[]): { points: Point[]; closed: boolean }[] {
  const at = new Map<string, number[]>();
  segments.forEach((s, i) => {
    for (const p of [s.a, s.b]) {
      const k = key(p);
      const list = at.get(k);
      if (list) list.push(i);
      else at.set(k, [i]);
    }
  });
  const used = new Array<boolean>(segments.length).fill(false);
  const next = (p: Point): { seg: number; to: Point } | null => {
    for (const i of at.get(key(p)) ?? []) {
      if (used[i]) continue;
      const s = segments[i] as Segment;
      used[i] = true;
      return { seg: i, to: key(s.a) === key(p) ? s.b : s.a };
    }
    return null;
  };
  const lines: { points: Point[]; closed: boolean }[] = [];
  segments.forEach((s, i) => {
    if (used[i]) return;
    used[i] = true;
    const points: Point[] = [s.a, s.b];
    for (let step = next(s.b); step; step = next(step.to)) points.push(step.to);
    const closed = key(points[0] as Point) === key(points[points.length - 1] as Point);
    if (!closed) {
      const back: Point[] = [];
      for (let step = next(s.a); step; step = next(step.to)) back.push(step.to);
      points.unshift(...back.reverse());
    }
    lines.push({ points, closed: closed || key(points[0] as Point) === key(points[points.length - 1] as Point) });
  });
  return lines;
}

/** Chaikin's corner cutting: a polygonal line made smooth; the ends of an open line stay where they are. */
export function smooth(points: Point[], closed: boolean, rounds = 2): Point[] {
  let pts = closed && points.length > 1 && key(points[0] as Point) === key(points[points.length - 1] as Point) ? points.slice(0, -1) : points;
  for (let r = 0; r < rounds; r++) {
    if (pts.length < 3) return pts;
    const out: Point[] = [];
    const n = pts.length;
    if (!closed) out.push(pts[0] as Point);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p = pts[i] as Point, q = pts[(i + 1) % n] as Point;
      out.push({ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 });
      out.push({ x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 });
    }
    if (!closed) out.push(pts[n - 1] as Point);
    pts = out;
  }
  return pts;
}
