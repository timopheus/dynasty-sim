import { seasonAt } from '../core/time/seasons';
import type { Ctx } from '../core/state';
import { toYmd } from '../core/time/calendar';

/**
 * The "where I am" block (D-438, D-447): the table of the place and what the hero is doing now. The core has no places
 * yet (S.9), so the table holds only what it knows — the season, from the date; a row it cannot fill is not drawn.
 * The core keeps the day an action ends, not the day it began, so the text says "days left", never "day X of Y".
 */
export interface WhereView {
  /** Rows of the table of the place: label and value. */
  table: { label: string; value: string }[];
  /** What the hero is doing now. */
  heading: string;
  /** A line under it: how long, or what the hero may do. */
  line: string;
  /** The house is over: nothing more can be done. */
  ended: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function daysLeft(n: number): string {
  return n === 1 ? '1 day left' : `${n} days left`;
}

function seasonRow(ctx: Ctx): { label: string; value: string } {
  const season = seasonAt(ctx.content, ctx.state.day).name;
  return { label: 'Season', value: `${season}, ${MONTHS[toYmd(ctx.state.day).month - 1] ?? ''}` };
}

export function whereView(ctx: Ctx): WhereView {
  const { state, content } = ctx;
  const table = [seasonRow(ctx)];
  if (state.status === 'ended') {
    return { table, heading: 'The house has come to an end', line: 'There is nobody left to act for.', ended: true };
  }
  if (state.backstory.running) {
    return { table, heading: 'Growing up', line: 'The early years of your hero. Answer in the window; the world waits.', ended: false };
  }
  const active = state.activeAction;
  if (active) {
    const name = content.actions.find((a) => a.id === active.actionId)?.name ?? active.actionId;
    return { table, heading: name, line: daysLeft(Math.max(0, active.endDay - state.day)), ended: false };
  }
  const free = state.status === 'awaiting_action' && !state.pendingEvent;
  return { table, heading: 'Free to act', line: free ? 'Choose what to do next in the panel on the right.' : '', ended: false };
}
