import { allChronicle } from '../archive/archive';
import type { ChronicleEntry } from '../chronicle/log';
import { placeDef, placeIdOf, placeKeyOf, position, routesFrom } from '../place/place';
import { placeFacts, weatherAt } from '../place/table';
import type { Ctx } from '../state';
import type { TextPart } from '../text/text';
import { seasonAt } from '../time/seasons';
import type { EntityPage } from './entity';

/** Lines of the journal about the place the page shows: the hero's arrivals, stays and turns. */
const VISIT_LIMIT = 10;

function visits(ctx: Ctx, id: string): ChronicleEntry[] {
  const out: ChronicleEntry[] = [];
  const all = allChronicle(ctx.state);
  for (let i = all.length - 1; i >= 0 && out.length < VISIT_LIMIT; i--) {
    const e = all[i] as ChronicleEntry;
    if (e.kind === 'journey' && e.parts.some((p) => typeof p !== 'string' && p.id === id)) out.push(e);
  }
  return out.reverse();
}

/** "3 days" for the days of a road. */
export function daysWord(n: number): string {
  return n === 1 ? '1 day' : `${n} days`;
}

/**
 * The page of a place `p…` (D-311, S.9): the table of D-447 — what the place is, whose land, what is there — then the
 * season and the weather today, the roads that lead from it and how far the hero is. The hero knows every place of the
 * region: no secrets here. A pure query.
 */
export function placePage(ctx: Ctx, id: string): EntityPage | null {
  const { state, content } = ctx;
  const facts = placeFacts(state, content, id);
  if (!facts) return null;
  const rows: EntityPage['facts'] = facts.rows.map((r) => ({ label: r.label, parts: [r.value] }));
  const season = seasonAt(content, state.day).name;
  const weather = weatherAt(state, content, id, state.day);
  rows.push({ label: 'Now', parts: [weather ? `${season}, ${weather}` : season] });
  const key = placeKeyOf(state, id);
  const roads: TextPart[] = [];
  for (const r of content.places?.roads ?? []) {
    const other = r.between[0] === key ? r.between[1] : r.between[1] === key ? r.between[0] : null;
    const otherId = other === null ? null : placeIdOf(state, other);
    if (otherId === null) continue;
    if (roads.length > 0) roads.push(', ');
    roads.push({ id: otherId, name: placeDef(state, content, otherId)?.name ?? other ?? '' }, ` (${daysWord(r.days)})`);
  }
  if (roads.length > 0) rows.push({ label: 'Roads', parts: roads });
  const pos = position(state, content);
  if (pos && 'at' in pos && pos.at === id && pos.journey === null) rows.push({ label: 'You', parts: ['You are here.'] });
  else {
    const way = routesFrom(state, content).find((r) => r.to === id);
    if (way) rows.push({ label: 'You', parts: [`${daysWord(way.days)} from where you are.`] });
  }
  return { id, kind: 'place', title: facts.name, subtitle: facts.description ?? '', facts: rows, chronicle: visits(ctx, id) };
}
