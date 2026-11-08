import { actionAvailability } from '../../core/actions/actions';
import { placeDef, position, roadDays, routesFrom, standingIn } from '../../core/place/place';
import type { Ctx } from '../../core/state';
import type { MapModel, Point } from './model';
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

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

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
  const roads = (content.places?.roads ?? []).flatMap((r) => {
    const a = points.get(idOf(r.between[0]) ?? ''), b = points.get(idOf(r.between[1]) ?? '');
    return a && b ? [{ a, b, days: r.days }] : [];
  });

  const pos = position(state, content);
  let hero: Point | null = null;
  if (pos && 'at' in pos) hero = points.get(pos.at) ?? null;
  else if (pos && 'road' in pos) {
    const a = points.get(pos.road.a), b = points.get(pos.road.b);
    const days = roadDays(state, content, pos.road.a, pos.road.b) ?? 1;
    if (a && b) hero = lerp(a, b, Math.max(0, Math.min(1, pos.road.done / days)));
  }
  const goal = pos?.journey ? points.get(pos.journey.to) ?? null : null;
  const journey = hero && goal ? { from: hero, to: goal } : null;

  const travel = content.actions.find((a) => a.target !== undefined) ?? null;
  const availability = travel ? actionAvailability(ctx).find((x) => x.action.id === travel.id) ?? null : null;
  const held = !(state.status === 'awaiting_action' || state.status === 'running') || state.pendingEvent !== null;
  const routes = new Map(routesFrom(state, content).map((r) => [r.to, r.days]));
  const here = standingIn(state, content);
  const going = state.activeAction?.target ?? null;
  const dayWord = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

  return {
    places,
    roads,
    hero,
    journey,
    describe: (id) => {
      const def = placeDef(state, content, id);
      if (!def) return '';
      const kind = kinds.get(def.kind) ?? def.kind;
      const where = def.realm ? `${kind[0]?.toUpperCase() ?? ''}${kind.slice(1)} of ${def.realm}` : kind;
      if (id === here) return `${where}. You are here.`;
      const days = routes.get(id);
      if (id === going && days !== undefined) return `${where}. You are on your way: ${dayWord(days)} left.`;
      return days === undefined ? `${where}. No road leads there from here.` : `${where}. ${dayWord(days)} of road from here.`;
    },
    travel: (id) => {
      const name = placeDef(state, content, id)?.name ?? id;
      const days = routes.get(id);
      const verb = going !== null ? 'Turn toward' : 'Travel to';
      const label = days === undefined ? `${verb} ${name}` : `${verb} ${name} (${dayWord(days)})`;
      if (!travel) return { label, enabled: false, reason: 'There is no travelling yet' };
      if (id === here) return { label: `Travel to ${name}`, enabled: false, reason: 'You are here' };
      if (id === going) return { label, enabled: false, reason: 'You are already on your way there' };
      if (held) return { label, enabled: false, reason: 'Answer the window first' };
      if (days === undefined) return { label, enabled: false, reason: 'No road leads there from here' };
      const reasons = availability?.unmet.map((u) => u) ?? [];
      if (availability?.hidden || reasons.length > 0) return { label, enabled: false, reason: reasons.join('; ') || 'Not now' };
      return { label, enabled: true, reason: '' };
    },
    onOpen: (id) => handlers.open(id),
    onTravel: (id) => { if (travel) handlers.travel(travel.id, id); },
  };
}
