import type { Ctx } from '../core/state';
import { actionRows, type ActionRow } from './event';

/**
 * The "where I am" block (D-438, D-437): what the core knows today. There are no places yet, so it names the occupation
 * and how long it has to run; the core keeps the day an action ends, not the day it began, so the text says "days left",
 * never "day X of Y".
 */
export interface WhereView {
  /** What the hero is doing now. */
  heading: string;
  /** A line under it: how long, or what the hero may do. */
  line: string;
  /**
   * The actions the player may start now, also while one is under way (a change of occupation, S.6) but for that one;
   * empty while something else (an event, the backstory) holds the hero.
   */
  actions: ActionRow[];
  /** The house is over: nothing more can be done. */
  ended: boolean;
}

function daysLeft(n: number): string {
  return n === 1 ? '1 day left' : `${n} days left`;
}

export function whereView(ctx: Ctx): WhereView {
  const { state, content } = ctx;
  if (state.status === 'ended') {
    return { heading: 'The house has come to an end', line: 'There is nobody left to act for.', actions: [], ended: true };
  }
  if (state.backstory.running) {
    return { heading: 'Growing up', line: 'The early years of your hero. Answer in the window; the world waits.', actions: [], ended: false };
  }
  const active = state.activeAction;
  if (active) {
    const name = content.actions.find((a) => a.id === active.actionId)?.name ?? active.actionId;
    const switchable = state.status === 'running' && !state.pendingEvent;
    const actions = switchable ? actionRows(ctx).filter((a) => a.id !== active.actionId) : [];
    return { heading: name, line: daysLeft(Math.max(0, active.endDay - state.day)), actions, ended: false };
  }
  const free = state.status === 'awaiting_action' && !state.pendingEvent;
  return {
    heading: 'Free to act',
    line: free ? 'Choose what to do next.' : '',
    actions: free ? actionRows(ctx) : [],
    ended: false,
  };
}
