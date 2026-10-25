import type { Content } from '../content/schema';
import type { Ctx, GameState, Invariant } from '../state';
import type { PlaceDef } from './content';

/**
 * Where the hero is (D-437, D-439, S.9a). A place is an entity of kind `p` (D-311): its record in the state holds the
 * permanent id and the key of the place in the content; everything else about it is read from `content.places`.
 * The records are made once, at a new game, in the order of the content (`placeOnNewGame`).
 */
export interface PlaceRecord {
  /** Permanent id, `p` and digits (D-020). */
  id: string;
  /** Id of the place in `content.places.list`. */
  key: string;
}

export interface PlaceState {
  place: {
    /** Record id of the place the hero stands in, or set out from while on the road; null without places in the content. */
    here: string | null;
    places: PlaceRecord[];
  };
}

export function initPlaceState(): PlaceState {
  return { place: { here: null, places: [] } };
}

/** The kind of the hero's place while on the road: reserved, no place has it (`checkPlaces`). */
export const ROAD_KIND = 'road';

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

/** Places a road leads to from where the hero stands, with its days, in the order of the roads in the content. */
export function routesFrom(state: GameState, content: Content): { to: string; days: number }[] {
  const places = content.places;
  const here = state.place.here;
  const hereKey = here === null ? null : placeKeyOf(state, here);
  if (!places || hereKey === null) return [];
  const out: { to: string; days: number }[] = [];
  for (const road of places.roads) {
    const [a, b] = road.between;
    const other = a === hereKey ? b : b === hereKey ? a : null;
    const to = other === null ? null : placeIdOf(state, other);
    if (to !== null) out.push({ to, days: road.days });
  }
  return out;
}

/** The hero stands in a place, or is on the road from one place to another (an action with a target is under way). */
export type Position = { at: string } | { road: { from: string; to: string; arriveDay: number } };

/** Where the hero is now; null without places in the content. A pure query. */
export function position(state: GameState, content: Content): Position | null {
  const here = state.place.here;
  if (!content.places || here === null) return null;
  const active = state.activeAction;
  // Only an action with `target: place` keeps a target (an invariant of actions/).
  if (active && active.target !== null) return { road: { from: here, to: active.target, arriveDay: active.endDay } };
  return { at: here };
}

/** Kind of the hero's place: the kind of the place he stands in, `road` on the road; null without places. */
export function heroPlaceKind(state: GameState, content: Content): string | null {
  const pos = position(state, content);
  if (!pos) return null;
  if ('road' in pos) return ROAD_KIND;
  return placeDef(state, content, pos.at)?.kind ?? null;
}

/** Puts the hero in a place, without the road: the place of birth (S.11a). Throws on an unknown record id. */
export function setHere(ctx: Ctx, id: string): void {
  if (!ctx.state.place.places.some((p) => p.id === id)) throw new Error(`Unknown place ${id}`);
  ctx.state.place.here = id;
}

export const placeInvariants: Invariant = ({ state, content }) => {
  const problems: string[] = [];
  const { here, places } = state.place;
  const list = content.places?.list ?? null;
  if (!list) {
    if (here !== null || places.length > 0) problems.push('places in the state without places in the content');
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
  if (here === null) problems.push('the hero is nowhere');
  else if (!ids.has(here)) problems.push(`the hero is in unknown place ${here}`);
  const target = state.activeAction?.target ?? null;
  if (target !== null && here !== null) {
    if (!ids.has(target)) problems.push(`the road leads to unknown place ${target}`);
    else if (!routesFrom(state, content).some((r) => r.to === target)) problems.push(`no road from ${here} to ${target}`);
  }
  return problems;
};
