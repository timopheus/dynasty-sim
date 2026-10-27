import { daysWord } from '../core/pages/place';
import { placeDef, position, roadDays, routesFrom } from '../core/place/place';
import { placeFacts, weatherAt } from '../core/place/table';
import type { Ctx } from '../core/state';
import { toYmd } from '../core/time/calendar';
import { seasonAt } from '../core/time/seasons';

/**
 * The "where I am" block (D-438, D-447): the place the hero is in or the road he is on, the table of the place and what
 * the hero is doing now. The core keeps the day an action ends, not the day it began, so the text says "days left",
 * never "day X of Y". A row that cannot be filled is not drawn (no dashes).
 */
export interface WhereView {
  /** The place the table is about (a link to its page), or null when the hero is on the road. */
  place: { id: string; name: string } | null;
  /** What stands above the table: the name of the place, or "On the road". */
  title: string;
  /** Rows of the table of the place: label and value. */
  table: { label: string; value: string }[];
  /** The line of description of the place (D-467), if it has one. */
  description: string | null;
  /** Standing or going: "Standing here", "Between Ostmere and Rohrbach, 1 day from Ostmere". */
  status: string;
  /** The nearest places the hero can go to from where he is now, with the days of the way (a link to the page each). */
  goTo: { id: string; name: string; days: number }[];
  /** What the hero is doing now. */
  heading: string;
  /** A line under it: how long, or what the hero may do. */
  line: string;
  /** The house is over: nothing more can be done. */
  ended: boolean;
}

/** How many of the nearest places the block names; the panel of actions lists them all. */
export const GO_TO_LIMIT = 4;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function daysLeft(n: number): string {
  return n === 1 ? '1 day left' : `${n} days left`;
}

interface Where {
  place: WhereView['place'];
  title: string;
  status: string;
  rows: { label: string; value: string }[];
  description: string | null;
  /** The place whose weather is told: the one the hero is in, or the nearer end of the road. */
  weatherOf: string;
  /** The journey under way, for the heading: "Heading for Valmont"; null when none. */
  heading: string | null;
}

function whereIs(ctx: Ctx): Where | null {
  const { state, content } = ctx;
  const pos = position(state, content);
  if (!pos) return null;
  const name = (id: string) => placeDef(state, content, id)?.name ?? id;
  const heading = pos.journey ? `Heading for ${name(pos.journey.to)}` : null;
  if ('road' in pos) {
    const { a, b, done } = pos.road;
    const total = roadDays(state, content, a, b) ?? done;
    const fromA = done * 2 <= total;
    const from = fromA ? a : b;
    return {
      place: null, title: 'On the road', status: `Between ${name(a)} and ${name(b)}, ${daysWord(fromA ? done : total - done)} from ${name(from)}`,
      rows: [], description: null, weatherOf: from, heading,
    };
  }
  if (pos.journey) {
    return { place: null, title: 'On the road', status: `Passing through ${name(pos.at)}`, rows: [], description: null, weatherOf: pos.at, heading };
  }
  const facts = placeFacts(state, content, pos.at);
  return { place: { id: pos.at, name: name(pos.at) }, title: name(pos.at), status: 'Standing here', rows: facts?.rows ?? [], description: facts?.description ?? null, weatherOf: pos.at, heading: null };
}

export function whereView(ctx: Ctx): WhereView {
  const { state, content } = ctx;
  const where = whereIs(ctx);
  const rows = [...(where?.rows ?? [])];
  rows.push({ label: 'Season', value: `${seasonAt(content, state.day).name}, ${MONTHS[toYmd(state.day).month - 1] ?? ''}` });
  const weather = where ? weatherAt(state, content, where.weatherOf, state.day) : null;
  if (weather) rows.push({ label: 'Weather', value: weather });
  const base = {
    place: where?.place ?? null, title: where?.title ?? '', table: rows, description: where?.description ?? null, status: where?.status ?? '',
    goTo: [] as WhereView['goTo'],
  };
  if (state.status === 'ended') {
    return { ...base, heading: 'The house has come to an end', line: 'There is nobody left to act for.', ended: true };
  }
  if (state.backstory.running) {
    return { ...base, heading: 'Growing up', line: 'The early years of your hero. Answer in the window; the world waits.', ended: false };
  }
  const goTo = routesFrom(state, content)
    .sort((a, b) => a.days - b.days)
    .slice(0, GO_TO_LIMIT)
    .map((r) => ({ id: r.to, name: name(state, content, r.to), days: r.days }));
  const active = state.activeAction;
  if (active) {
    const action = content.actions.find((a) => a.id === active.actionId);
    return { ...base, goTo, heading: where?.heading ?? action?.name ?? active.actionId, line: daysLeft(Math.max(0, active.endDay - state.day)), ended: false };
  }
  const free = state.status === 'awaiting_action' && !state.pendingEvent;
  const onRoad = where !== null && where.place === null;
  const line = !free ? '' : onRoad ? 'Go on, turn back or choose another place: the roads are in the panel on the right.' : '';
  return { ...base, goTo, heading: 'Free to act', line, ended: false };
}

function name(state: Ctx['state'], content: Ctx['content'], id: string): string {
  return placeDef(state, content, id)?.name ?? id;
}
