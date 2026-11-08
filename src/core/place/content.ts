import { z } from 'zod';
import { checkReason } from '../conditions/reasons';
import { walkKeys } from '../conditions/walk';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';

/**
 * One place of the region (D-437, D-439): its id in the content, its name and its kind (town, village, …). The rest is the
 * table of the place (D-447, S.9): where the place stands on the map, who lives there, what is there, the climate that
 * weather follows and the one line of description by `docs/reference/places-style.md`. A field left out leaves its row
 * off the table: no row is drawn with a dash. The real content fills them all (a test checks).
 */
export const PlaceSchema = z.strictObject({
  id: Id,
  name: Text,
  kind: Id,
  /** The realm the place lies in, as the table shows it ("Haverland"). */
  realm: Text.optional(),
  /** The province of the map. */
  province: Text.optional(),
  /** What the people of the realm are called ("Haverlanders"). */
  people: Text.optional(),
  /** Inhabitants, from the map; the size word of the table comes from it (`places.sizes`). */
  population: Int.min(1).optional(),
  /** Land and water around the place. */
  landscape: Text.optional(),
  /** What is in the place: a harbour, a market, a keep. */
  has: z.array(Text).min(1).optional(),
  /** Id of a climate of `places.climates`: the weather follows it and the season. */
  climate: Id.optional(),
  /** The line of description (D-467): one detail, no name, kind, realm or weather; tone A on roads and villages, B in towns. */
  description: Text.optional(),
});

/** Weather the climate may bring in the seasons it names; `weight` is the chance among those of the season (integers). */
const WeatherSchema = z.strictObject({ season: Id, name: Text, weight: Int.min(1) });

/**
 * Optional top-level key `places` (S.9a points; S.9 adds the rest of the table of a place, D-447):
 * - `kinds`: kinds of places with their names; `road` is reserved for the hero on the road;
 * - `road`: the name of being on the road in the reasons of conditions ("on the road");
 * - `list`: 12–16 places of the region in the slice (D-439);
 * - `roads`: a road between two places and its days; a journey goes to any place by the shortest way (D-462);
 * - `start`: the place a new game starts in, until the place of birth (S.11a);
 * - `reasons`: texts of unmet conditions: `kind` (`{kinds}`), `place` (`{places}`), `no_road` (none);
 * - `sizes`: words for the size of a place by its inhabitants, the largest `min` not above them;
 * - `climates`: the weather of a climate by season (S.9); the table of a place shows one, the same for a place and a week of a seed;
 * - `texts`: lines of the journal about the road (placeholders `{name}`, `{place}`, `{from}`, `{to}`).
 */
export const PlacesContentSchema = z.strictObject({
  kinds: z.array(z.strictObject({ id: Id, name: Text })).min(1),
  road: Text,
  list: z.array(PlaceSchema).min(1),
  roads: z.array(z.strictObject({ between: z.tuple([Id, Id]), days: Int.min(1) })),
  start: Id,
  reasons: z.strictObject({ kind: Text, place: Text, no_road: Text }),
  sizes: z.array(z.strictObject({ min: Int.min(0), name: Text })).min(1).optional(),
  climates: z.array(z.strictObject({ id: Id, weather: z.array(WeatherSchema).min(1) })).optional(),
  texts: z.strictObject({ arrive: Text, stopped: Text, stayed: Text, turned: Text }).optional(),
});

export type PlaceDef = z.infer<typeof PlaceSchema>;
export type PlacesContent = z.infer<typeof PlacesContentSchema>;

/** Kind of the hero on the road (`place.ts`, `ROAD_KIND`); repeated here so the content check imports no state code. */
const ROAD = 'road';

/** Keys of conditions that name kinds and places (`place/conditions.ts`). */
const KIND_KEYS = ['at_place_kind'];
const PLACE_KEYS = ['at_place'];

export const checkPlaces: CrossCheck = ({ places, events, actions, time }) => {
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
    const sizeMins = (item.sizes ?? []).map((s) => s.min);
    if (item.sizes && !sizeMins.includes(0)) err('sizes', 'no size starts at 0: a small place would have no word');
    if (new Set(sizeMins).size !== sizeMins.length) err('sizes', 'two sizes start at the same number');
    const seasonIds = new Set(time.flatMap((t) => t.item.seasons.map((s) => s.id)));
    const climateIds = new Set<string>();
    (item.climates ?? []).forEach((c, i) => {
      if (climateIds.has(c.id)) err(`climates[${i}].id`, `duplicate climate "${c.id}"`);
      climateIds.add(c.id);
      c.weather.forEach((w, j) => {
        if (!seasonIds.has(w.season)) err(`climates[${i}].weather[${j}].season`, `unknown season "${w.season}"`);
      });
      for (const id of seasonIds) if (!c.weather.some((w) => w.season === id)) err(`climates[${i}]`, `climate "${c.id}" has no weather for the season "${id}"`);
    });
    item.list.forEach((p, i) => {
      if (p.climate !== undefined && !climateIds.has(p.climate)) err(`list[${i}].climate`, `unknown climate "${p.climate}"`);
      if (p.climate !== undefined && !item.climates) err(`list[${i}].climate`, 'a climate needs the list `places.climates`');
    });
    const texts = item.texts;
    if (texts) {
      for (const [key, allowed] of [['arrive', ['name', 'place']], ['stopped', ['name', 'from', 'to']], ['stayed', ['name', 'place']], ['turned', ['name', 'place']]] as const) {
        const problem = checkReason(texts[key], allowed);
        if (problem) err(`texts.${key}`, problem);
      }
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
