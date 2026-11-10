import type { Content } from '../content/schema';
import { int, seedRng } from '../rng';
import type { GameState } from '../state';
import { seasonAt } from '../time/seasons';
import type { PlaceDef } from './content';
import { placeDef } from './place';

/**
 * The table of a place (D-447, S.9): the rows an author's content and the map give, then the weather. A row without
 * its data is left out — none is drawn with a dash. Pure queries: nothing here spends the world's randomness or is
 * stored.
 */
export interface PlaceRow {
  label: string;
  value: string;
}

/** Stream of the weather in `seedRng(seed, stream)`: above the streams of other modules, a week and a place apart. */
const WEATHER_STREAM = 0x57a70000;
/** Weeks are counted from the day 0; a place has a row of its own in the stream, 64 rows to a week at most. */
const PLACES_PER_WEEK = 64;

/**
 * The weather of a place on a day: its climate and the season give the choices, the seed, the place and the week of the
 * day pick one. The same on every call, for the same game, and for any state of it; never stored. Null without a climate.
 */
export function weatherAt(state: GameState, content: Content, placeId: string, day: number): string | null {
  const def = placeDef(state, content, placeId);
  if (!def?.climate) return null;
  const climate = content.places?.climates?.find((c) => c.id === def.climate);
  if (!climate) return null;
  const season = seasonAt(content, day).id;
  const choices = climate.weather.filter((w) => w.season === season);
  const total = choices.reduce((sum, w) => sum + w.weight, 0);
  if (total === 0) return null;
  const index = state.place.places.findIndex((p) => p.id === placeId);
  const week = Math.floor(day / 7);
  let roll = int(seedRng(state.seed, WEATHER_STREAM + week * PLACES_PER_WEEK + index), 0, total - 1);
  for (const w of choices) {
    if (roll < w.weight) return w.name;
    roll -= w.weight;
  }
  return null;
}

/** The word for the size of a place: the largest `min` of `places.sizes` not above its inhabitants. */
function sizeWord(content: Content, def: PlaceDef): string | null {
  if (def.population === undefined) return null;
  const sizes = [...(content.places?.sizes ?? [])].sort((a, b) => b.min - a.min);
  return sizes.find((s) => s.min <= (def.population as number))?.name ?? null;
}

/** The name of a kind without its article: "a town" → "town". */
function bare(name: string): string {
  return name.replace(/^(an?|the) /, '');
}

/** What the table shows of a place by the content: kind and size, realm and province, people, land, what is there. */
export function placeFacts(state: GameState, content: Content, placeId: string): { name: string; rows: PlaceRow[]; description: string | null } | null {
  const def = placeDef(state, content, placeId);
  if (!def || !content.places) return null;
  const rows: PlaceRow[] = [];
  const kind = content.places.kinds.find((k) => k.id === def.kind);
  const size = sizeWord(content, def);
  if (kind) rows.push({ label: 'Place', value: size ? `${size} ${bare(kind.name)}` : bare(kind.name) });
  if (def.realm) rows.push({ label: 'Realm', value: def.province ? `${def.realm} · ${def.province}` : def.realm });
  if (def.people) rows.push({ label: 'People', value: def.people });
  if (def.landscape) rows.push({ label: 'Land', value: def.landscape });
  if (def.has) rows.push({ label: 'Here', value: def.has.join(', ') });
  return { name: def.name, rows, description: def.description ?? null };
}
