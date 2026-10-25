import type { Content } from '../content/schema';
import type { Ctx, GameState, Invariant } from '../state';
import type { PlaceDef } from './content';

/**
 * Where the hero is (D-437, D-439, D-461, D-462). A place is an entity of kind `p` (D-311): its record in the state holds
 * the permanent id and the key of the place in the content; everything else about it is read from `content.places`.
 * The records are made once, at a new game, in the order of the content (`placeOnNewGame`).
 *
 * The hero stands either in a place (`here`) or on a road between two places (`road`, D-462: a journey broken off
 * leaves him there). A journey is an action with a target (`activeAction.target`); while it runs, `here`/`road` keep the
 * point he set out from, and where he is today follows from the days gone by along the shortest way (`position`).
 */
export interface PlaceRecord {
  /** Permanent id, `p` and digits (D-020). */
  id: string;
  /** Id of the place in `content.places.list`. */
  key: string;
}

/** A point on the road between places `a` and `b` (record ids), `done` whole days from `a`, short of `b`. */
export interface RoadPoint {
  a: string;
  b: string;
  done: number;
}

export interface PlaceState {
  place: {
    /** Record id of the place the hero stands in (or set out from); null on the road and without places in the content. */
    here: string | null;
    /** Where on a road the hero stands (or set out from); null in a place. */
    road: RoadPoint | null;
    places: PlaceRecord[];
  };
}

export function initPlaceState(): PlaceState {
  return { place: { here: null, road: null, places: [] } };
}

/** The kind of the hero's place while on the road: reserved, no place has it (`checkPlaces`). */
export const ROAD_KIND = 'road';

/** Where someone can be: in a place (record id) or at a point of a road. */
export type Point = { place: string } | { road: RoadPoint };

/** Record id of the place with this content key, or null. */
export function placeIdOf(state: GameState, key: string): string | null {
  return state.place.places.find((p) => p.key === key)?.id ?? null;
}

/** Content key of the place with this record id, or null. */
export function placeKeyOf(state: GameState, id: string): string | null {
  return state.place.places.find((p) => p.id === id)?.key ?? null;
}

/** The content of the place with this record id, or null. */
export function placeDef(state: GameState, content: Content, id: string): PlaceDef | null {
  const key = placeKeyOf(state, id);
  return key === null ? null : (content.places?.list.find((p) => p.id === key) ?? null);
}

/** Days of the road between two places (record ids), or null if no road joins them. */
export function roadDays(state: GameState, content: Content, a: string, b: string): number | null {
  const ka = placeKeyOf(state, a);
  const kb = placeKeyOf(state, b);
  const road = content.places?.roads.find((r) => (r.between[0] === ka && r.between[1] === kb) || (r.between[0] === kb && r.between[1] === ka));
  return road ? road.days : null;
}

/** The point the hero set out from, or stands at when no journey runs; null without places. */
function startPoint(state: GameState): Point | null {
  const { here, road } = state.place;
  if (here !== null) return { place: here };
  if (road !== null) return { road };
  return null;
}

interface Way {
  /** Days from the start to each place, by record id; a place not reached is absent. */
  dist: Map<string, number>;
  /** The place before each place on the shortest way; null for a place reached straight from the start. */
  prev: Map<string, string | null>;
}

/**
 * Shortest ways in whole days from a point to every place (D-462). Ties go to the place earlier in the content, so the
 * way is the same on every run. A local Map, never stored. Pure.
 */
function shortestWays(state: GameState, content: Content, from: Point): Way {
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const ids = state.place.places.map((p) => p.id);
  if ('place' in from) {
    dist.set(from.place, 0);
    prev.set(from.place, null);
  } else {
    const days = roadDays(state, content, from.road.a, from.road.b) ?? 0;
    dist.set(from.road.a, from.road.done);
    prev.set(from.road.a, null);
    dist.set(from.road.b, days - from.road.done);
    prev.set(from.road.b, null);
  }
  const done = new Set<string>();
  for (;;) {
    let next: string | null = null;
    for (const id of ids) {
      const d = dist.get(id);
      if (d === undefined || done.has(id)) continue;
      if (next === null || d < (dist.get(next) as number)) next = id;
    }
    if (next === null) break;
    done.add(next);
    const base = dist.get(next) as number;
    for (const id of ids) {
      if (done.has(id)) continue;
      const days = roadDays(state, content, next, id);
      if (days === null) continue;
      const d = base + days;
      const old = dist.get(id);
      if (old === undefined || d < old) {
        dist.set(id, d);
        prev.set(id, next);
      }
    }
  }
  return { dist, prev };
}

/** The places of the shortest way from a point to a place, with the day each is reached, counted from the start. */
function legsOf(way: Way, to: string): { place: string; day: number }[] {
  const legs: { place: string; day: number }[] = [];
  let at: string | null = to;
  while (at !== null) {
    legs.unshift({ place: at, day: way.dist.get(at) as number });
    at = way.prev.get(at) ?? null;
  }
  return legs;
}

/** A point `elapsed` days along the shortest way from `from` to `to`. */
function pointAlong(state: GameState, content: Content, from: Point, to: string, elapsed: number): Point {
  const way = shortestWays(state, content, from);
  const legs = legsOf(way, to);
  let last: Point = from;
  let lastDay = 0;
  for (const leg of legs) {
    if (leg.day <= elapsed) {
      last = { place: leg.place };
      lastDay = leg.day;
      continue;
    }
    const gone = elapsed - lastDay;
    if (gone <= 0) return last;
    if ('place' in last) return { road: { a: last.place, b: leg.place, done: gone } };
    // Still on the first stretch, from a point of a road toward one of its ends.
    const r = last.road;
    return { road: { a: r.a, b: r.b, done: leg.place === r.b ? r.done + gone : r.done - gone } };
  }
  return last;
}

/** A journey under way: the place it leads to and the day of arrival. */
export interface Journey {
  to: string;
  arriveDay: number;
}

/**
 * Where the hero is now: in a place or at a point of a road, and on a journey or not. On a journey he is on the road
 * even on the day he sets out or passes through a place on the way.
 */
export type Position = { at: string; journey: Journey | null } | { road: RoadPoint; journey: Journey | null };

/** The point the hero is at today, a journey counted; null without places. Pure. */
export function currentPoint(state: GameState, content: Content): Point | null {
  const from = startPoint(state);
  if (!content.places || from === null) return null;
  const active = state.activeAction;
  // Only an action with `target: place` keeps a target (an invariant of actions/).
  if (!active || active.target === null) return from;
  const total = shortestWays(state, content, from).dist.get(active.target);
  if (total === undefined) return from;
  return pointAlong(state, content, from, active.target, state.day - (active.endDay - total));
}

/** Where the hero is now; null without places in the content. A pure query. */
export function position(state: GameState, content: Content): Position | null {
  const point = currentPoint(state, content);
  if (!point) return null;
  const active = state.activeAction;
  const journey = active && active.target !== null ? { to: active.target, arriveDay: active.endDay } : null;
  return 'road' in point ? { road: point.road, journey } : { at: point.place, journey };
}

/** Kind of the hero's place: the kind of the place he stands in, `road` on the road or on a journey; null without places. */
export function heroPlaceKind(state: GameState, content: Content): string | null {
  const pos = position(state, content);
  if (!pos) return null;
  if ('road' in pos || pos.journey !== null) return ROAD_KIND;
  return placeDef(state, content, pos.at)?.kind ?? null;
}

/** The place the hero stands in, not passing through; null on the road, on a journey and without places. */
export function standingIn(state: GameState, content: Content): string | null {
  const pos = position(state, content);
  return pos && 'at' in pos && pos.journey === null ? pos.at : null;
}

/**
 * Places the hero can set out for from where he is now, with the days of the shortest way (D-462): every place reached,
 * but the one he stands in; in the order of the content.
 */
export function routesFrom(state: GameState, content: Content): { to: string; days: number }[] {
  const from = currentPoint(state, content);
  if (!from) return [];
  const { dist } = shortestWays(state, content, from);
  const out: { to: string; days: number }[] = [];
  for (const { id } of state.place.places) {
    const days = dist.get(id);
    if (days !== undefined && days > 0) out.push({ to: id, days });
  }
  return out;
}

/**
 * A journey stops short of its end (another occupation, an illness, the hero's death, D-462): he stays where the days
 * gone by have brought him — in a place he passed, or on the road. Call before the action is dropped or replaced.
 */
export function stopJourney(ctx: Ctx): void {
  const { state, content } = ctx;
  if (!state.activeAction || state.activeAction.target === null) return;
  const point = currentPoint(state, content);
  if (!point) return;
  setPoint(state, point);
}

/** The journey has come to its end: the hero is in the place it led to. */
export function arrive(state: GameState, id: string): void {
  setPoint(state, { place: id });
}

function setPoint(state: GameState, point: Point): void {
  state.place.here = 'place' in point ? point.place : null;
  state.place.road = 'road' in point ? { ...point.road } : null;
}

/** Puts the hero in a place, without the road: the place of birth (S.11a). Throws on an unknown record id. */
export function setHere(ctx: Ctx, id: string): void {
  if (!ctx.state.place.places.some((p) => p.id === id)) throw new Error(`Unknown place ${id}`);
  setPoint(ctx.state, { place: id });
}

export const placeInvariants: Invariant = ({ state, content }) => {
  const problems: string[] = [];
  const { here, road, places } = state.place;
  const list = content.places?.list ?? null;
  if (!list) {
    if (here !== null || road !== null || places.length > 0) problems.push('places in the state without places in the content');
    return problems;
  }
  if (places.length !== list.length) problems.push(`${places.length} place records for ${list.length} places of the content`);
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const p of places) {
    if (!/^p\d+$/.test(p.id)) problems.push(`place record id ${p.id} is not p and digits`);
    if (ids.has(p.id)) problems.push(`place record ${p.id} twice`);
    if (keys.has(p.key)) problems.push(`place ${p.key} has two records`);
    if (!list.some((d) => d.id === p.key)) problems.push(`place record ${p.id} names unknown place ${p.key}`);
    ids.add(p.id);
    keys.add(p.key);
  }
  if ((here === null) === (road === null)) problems.push('the hero is in no place and on no road, or in both');
  if (here !== null && !ids.has(here)) problems.push(`the hero is in unknown place ${here}`);
  if (road !== null) {
    const days = ids.has(road.a) && ids.has(road.b) ? roadDays(state, content, road.a, road.b) : null;
    if (days === null) problems.push(`no road between ${road.a} and ${road.b}`);
    else if (!Number.isSafeInteger(road.done) || road.done <= 0 || road.done >= days) problems.push(`the hero is ${road.done} days along a road of ${days}`);
  }
  const target = state.activeAction?.target ?? null;
  if (target !== null) {
    if (!ids.has(target)) problems.push(`the journey leads to unknown place ${target}`);
    else if (target === here) problems.push(`a journey to ${target}, where the hero already is`);
  }
  return problems;
};
