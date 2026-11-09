import { actionAvailability } from '../../core/actions/actions';
import { placeDef, position, roadDays, routesFrom, standingIn } from '../../core/place/place';
import { formatDate } from '../../core/time/calendar';
import type { Ctx } from '../../core/state';
import { cellAt, type MapModel, type Point } from './model';
import { partOf, pointOf, wayBetween } from './roads';
import type { MapProps } from './types';

/** Where the places of the game lie on the map: the towns of the map with the same names (S.9 named the places after them). */
function placePoints(ctx: Ctx, model: MapModel): Map<string, Point> {
  const out = new Map<string, Point>();
  for (const record of ctx.state.place.places) {
    const def = placeDef(ctx.state, ctx.content, record.id);
    const burg = def ? model.burgs.find((b) => b.name === def.name) : undefined;
    if (burg) out.set(record.id, { x: burg.x, y: burg.y });
  }
  return out;
}

/** The land around a place, in a few words, by the map's terrain at its cell. */
const LAND_WORDS: Record<string, string> = {
  plains: 'open plains', farmlands: 'farmland', floodplains: 'river meadows', drylands: 'dry country', steppe: 'steppe',
  desert: 'desert', forest: 'forest', taiga: 'pine forest', jungle: 'thick forest', wetlands: 'marshes', tundra: 'barren land',
  hills: 'hills', mountains: 'mountains', peaks: 'high mountains', glacier: 'ice',
};

/**
 * The places of the journey's way, in order, from the point it set out from to the place it leads to: the same
 * shortest way in whole days as the journey itself takes (D-462; ties to the place earlier in the records). A query.
 */
function journeyPlaces(ctx: Ctx, to: string): string[] {
  const { state, content } = ctx;
  const ids = state.place.places.map((p) => p.id);
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const { here, road } = state.place;
  if (here !== null) {
    dist.set(here, 0);
    prev.set(here, null);
  } else if (road !== null) {
    dist.set(road.a, road.done);
    prev.set(road.a, null);
    dist.set(road.b, (roadDays(state, content, road.a, road.b) ?? 0) - road.done);
    prev.set(road.b, null);
  } else return [];
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
    for (const id of ids) {
      const days = done.has(id) ? null : roadDays(state, content, next, id);
      if (days === null) continue;
      const d = (dist.get(next) as number) + days;
      const old = dist.get(id);
      if (old === undefined || d < old) { dist.set(id, d); prev.set(id, next); }
    }
  }
  if (!dist.has(to)) return [];
  const way: string[] = [];
  for (let at: string | null = to; at !== null; at = prev.get(at) ?? null) way.unshift(at);
  return way;
}

/**
 * What the map shows of the game (M.1): the places, the roads between them, the hero where he is (in a place or on a
 * road), his journey, and what the menu of a place offers. Pure: queries only.
 */
export function mapProps(ctx: Ctx, model: MapModel, handlers: { open: (id: string) => void; travel: (actionId: string, id: string) => void }): MapProps {
  const { state, content } = ctx;
  const points = placePoints(ctx, model);
  const kinds = new Map((content.places?.kinds ?? []).map((k) => [k.id, k.name]));
  const places = state.place.places.flatMap((record) => {
    const def = placeDef(state, content, record.id);
    const at = points.get(record.id);
    return def && at ? [{ id: record.id, name: def.name, at, kind: def.kind }] : [];
  });
  const idOf = (key: string) => state.place.places.find((p) => p.key === key)?.id ?? null;
  const roadWay = (a: string, b: string): Point[] | null => {
    const pa = points.get(a), pb = points.get(b);
    return pa && pb ? wayBetween(model, pa, pb) : null;
  };
  const roads = (content.places?.roads ?? []).flatMap((r) => {
    const a = points.get(idOf(r.between[0]) ?? ''), b = points.get(idOf(r.between[1]) ?? '');
    return a && b ? [{ a, b, days: r.days, path: wayBetween(model, a, b) }] : [];
  });

  // the hero: in a place, or at his point of a road along the map's road
  // the peoples of the map by the names the game gives them: the people of the realm of a place, at that place's cell
  const peoples = new Map<number, string>();
  for (const record of state.place.places) {
    const def = placeDef(state, content, record.id);
    const at = points.get(record.id);
    if (!def?.people || !at) continue;
    const cell = cellAt(model, at);
    const culture = cell >= 0 ? model.culture[cell] : undefined;
    // one name for one people: a second culture in the same realm keeps the map's own name
    if (culture !== undefined && culture !== 0 && !peoples.has(culture) && ![...peoples.values()].includes(def.people)) peoples.set(culture, def.people);
  }

  const pos = position(state, content);
  let hero: Point | null = null;
  let ahead: Point[] = [];
  let from: string | null = null;
  if (pos && 'at' in pos) {
    hero = points.get(pos.at) ?? null;
    from = pos.at;
    if (hero) ahead = [hero];
  } else if (pos && 'road' in pos) {
    const way = roadWay(pos.road.a, pos.road.b);
    const days = roadDays(state, content, pos.road.a, pos.road.b) ?? 1;
    const share = Math.max(0, Math.min(1, pos.road.done / days));
    if (way) hero = pointOf(way, share);
    // which end of the road the journey heads for decides the part of the road still ahead
    const legs = pos.journey ? journeyPlaces(ctx, pos.journey.to) : [];
    const toB = legs.indexOf(pos.road.b) >= legs.indexOf(pos.road.a);
    from = toB ? pos.road.b : pos.road.a;
    if (way) ahead = toB ? partOf(way, share, 1) : partOf(way, 0, share).reverse();
  }
  let journey: { path: Point[] } | null = null;
  if (pos?.journey && hero && from !== null) {
    const legs = journeyPlaces(ctx, pos.journey.to);
    const path = [...ahead];
    for (let i = Math.max(0, legs.indexOf(from)) + 1; i < legs.length; i++) {
      const way = roadWay(legs[i - 1] as string, legs[i] as string);
      if (way) path.push(...way.slice(1));
    }
    if (path.length > 1) journey = { path };
  }

  const travel = content.actions.find((a) => a.target !== undefined) ?? null;
  const availability = travel ? actionAvailability(ctx).find((x) => x.action.id === travel.id) ?? null : null;
  const held = !(state.status === 'awaiting_action' || state.status === 'running') || state.pendingEvent !== null;
  const routes = new Map(routesFrom(state, content).map((r) => [r.to, r.days]));
  const here = standingIn(state, content);
  const going = state.activeAction?.target ?? null;
  const money = (travel?.effects as { money?: number } | undefined)?.money ?? 0;
  const cost = money < 0 ? -money : 0;
  const dayWord = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

  return {
    places,
    roads,
    hero,
    journey,
    peoples,
    // the tip of a place in the form of CK3's: what and whose, the land around, then the way there and the arrival
    describe: (id) => {
      const def = placeDef(state, content, id);
      if (!def) return '';
      const kind = kinds.get(def.kind) ?? def.kind;
      const where = def.realm ? `${kind[0]?.toUpperCase() ?? ''}${kind.slice(1)} of ${def.realm}` : kind;
      const at = points.get(id);
      const cell = at ? cellAt(model, at) : -1;
      const land = cell >= 0 ? LAND_WORDS[model.terrains[model.terrain[cell] as number] ?? ''] : undefined;
      const head = land ? `${where}, ${land}.` : `${where}.`;
      if (id === here) return `${head} You are here.`;
      const days = routes.get(id);
      const arrival = (n: number) => `arriving about ${formatDate(state.day + n)}`;
      if (id === going && days !== undefined) return `${head} On your way: ${dayWord(days)} left, ${arrival(days)}.`;
      return days === undefined ? `${head} No road leads there from here.` : `${head} ${dayWord(days)} of road, ${arrival(days)}.`;
    },
    travel: (id) => {
      const name = placeDef(state, content, id)?.name ?? id;
      const days = routes.get(id);
      const verb = going !== null ? 'Turn toward' : 'Travel to';
      const label = `${id === going ? 'Travel to' : verb} ${name}`;
      // the days and the price stand under the name, as on the buttons of the actions and the page of the place (D-443)
      const note = [...(days !== undefined ? [dayWord(days)] : []), ...(cost > 0 ? [`costs ${cost} crowns`] : [])].join(' · ');
      const grey = (reason: string) => ({ label, note, enabled: false, reason });
      if (!travel) return grey('There is no travelling yet');
      if (id === here) return { label: `Travel to ${name}`, note, enabled: false, reason: 'You are here' };
      if (id === going) return grey('You are already on your way there');
      if (held) return grey('Answer the window first');
      if (days === undefined) return grey('No road leads there from here');
      const reasons = availability?.unmet.map((u) => u) ?? [];
      if (availability?.hidden || reasons.length > 0) return grey(reasons.join('; ') || 'Not now');
      return { label, note, enabled: true, reason: '' };
    },
    onOpen: (id) => handlers.open(id),
    onTravel: (id) => { if (travel) handlers.travel(travel.id, id); },
  };
}
