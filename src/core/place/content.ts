import { z } from 'zod';
import { checkReason } from '../conditions/reasons';
import { walkKeys } from '../conditions/walk';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';

/** One place of the region (D-437, D-439): its id in the content, its name and its kind (town, village, …). */
export const PlaceSchema = z.strictObject({
  id: Id,
  name: Text,
  kind: Id,
});

/**
 * Optional top-level key `places` (S.9a points; S.9 adds the rest of the table of a place, D-447):
 * - `kinds`: kinds of places with their names; `road` is reserved for the hero on the road;
 * - `road`: the name of being on the road in the reasons of conditions ("on the road");
 * - `list`: 12–16 places of the region in the slice (D-439);
 * - `roads`: a road between two places and its days; a journey goes to any place by the shortest way (D-462);
 * - `start`: the place a new game starts in, until the place of birth (S.11a);
 * - `reasons`: texts of unmet conditions: `kind` (`{kinds}`), `place` (`{places}`), `no_road` (none).
 */
export const PlacesContentSchema = z.strictObject({
  kinds: z.array(z.strictObject({ id: Id, name: Text })).min(1),
  road: Text,
  list: z.array(PlaceSchema).min(1),
  roads: z.array(z.strictObject({ between: z.tuple([Id, Id]), days: Int.min(1) })),
  start: Id,
  reasons: z.strictObject({ kind: Text, place: Text, no_road: Text }),
});

export type PlaceDef = z.infer<typeof PlaceSchema>;
export type PlacesContent = z.infer<typeof PlacesContentSchema>;

/** Kind of the hero on the road (`place.ts`, `ROAD_KIND`); repeated here so the content check imports no state code. */
const ROAD = 'road';

/** Keys of conditions that name kinds and places (`place/conditions.ts`). */
const KIND_KEYS = ['at_place_kind'];
const PLACE_KEYS = ['at_place'];

export const checkPlaces: CrossCheck = ({ places, events, actions }) => {
  const errors: ContentError[] = [];
  const kinds = new Set<string>([ROAD]);
  const placeIds = new Set<string>();
  for (const { file, item } of places) {
    const err = (path: string, message: string) => errors.push({ file, path: `places.${path}`, message });
    const kindIds = new Set<string>();
    item.kinds.forEach((k, i) => {
      if (k.id === ROAD) err(`kinds[${i}].id`, `"${ROAD}" is the kind of the hero on the road; a place cannot have it`);
      else if (kindIds.has(k.id)) err(`kinds[${i}].id`, `duplicate kind "${k.id}"`);
      kindIds.add(k.id);
      kinds.add(k.id);
    });
    item.list.forEach((p, i) => {
      if (placeIds.has(p.id)) err(`list[${i}].id`, `duplicate place "${p.id}"`);
      placeIds.add(p.id);
      if (!kindIds.has(p.kind) || p.kind === ROAD) err(`list[${i}].kind`, `unknown kind "${p.kind}"`);
    });
    if (!placeIds.has(item.start)) err('start', `unknown place "${item.start}"`);
    const pairs = new Set<string>();
    const next = new Map<string, string[]>();
    item.roads.forEach((r, i) => {
      const [a, b] = r.between;
      for (const [j, end] of [a, b].entries()) if (!placeIds.has(end)) err(`roads[${i}].between[${j}]`, `unknown place "${end}"`);
      if (a === b) err(`roads[${i}].between`, `a road from "${a}" to itself`);
      const pair = [a, b].sort().join('|');
      if (pairs.has(pair)) err(`roads[${i}].between`, `a second road between "${a}" and "${b}"`);
      pairs.add(pair);
      next.set(a, [...(next.get(a) ?? []), b]);
      next.set(b, [...(next.get(b) ?? []), a]);
    });
    // Every place can be reached from the start: else the hero could never get there.
    if (placeIds.has(item.start)) {
      const seen = new Set<string>([item.start]);
      const queue = [item.start];
      while (queue.length > 0) {
        for (const n of next.get(queue.shift() as string) ?? []) {
          if (!seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      item.list.forEach((p, i) => {
        if (!seen.has(p.id)) err(`list[${i}]`, `no road leads from "${item.start}" to "${p.id}"`);
      });
    }
    for (const [key, allowed] of [['kind', ['kinds']], ['place', ['places']], ['no_road', []]] as const) {
      const problem = checkReason(item.reasons[key], allowed);
      if (problem) err(`reasons.${key}`, problem);
    }
  }
  const users: { file: string; base: string; item: unknown }[] = [
    ...events.map((e) => ({ file: e.file, base: `events[${e.index}]`, item: e.item as unknown })),
    ...actions.map((a) => ({ file: a.file, base: `actions[${a.index}]`, item: a.item as unknown })),
  ];
  const needKey = (file: string, path: string) => errors.push({ file, path, message: 'a key of places needs the top-level key "places"' });
  for (const { file, base, item } of users) {
    walkKeys(item, base, KIND_KEYS, (v, path) => {
      if (places.length === 0) return needKey(file, path);
      for (const id of v as string[]) if (!kinds.has(id)) errors.push({ file, path, message: `unknown kind of place "${id}"` });
    });
    walkKeys(item, base, PLACE_KEYS, (v, path) => {
      if (places.length === 0) return needKey(file, path);
      for (const id of v as string[]) if (!placeIds.has(id)) errors.push({ file, path, message: `unknown place "${id}"` });
    });
  }
  for (const { file, index, item } of events) {
    item.places?.forEach((id, i) => {
      const path = `events[${index}].places[${i}]`;
      if (places.length === 0) needKey(file, path);
      else if (!kinds.has(id)) errors.push({ file, path, message: `unknown kind of place "${id}"; an event is bound to kinds of places and "${ROAD}"` });
    });
  }
  for (const { file, index, item } of actions) {
    if (item.target !== undefined && places.length === 0) needKey(file, `actions[${index}].target`);
  }
  return errors;
};
