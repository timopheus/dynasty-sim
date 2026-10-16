import { isInt } from '../helpers';
import type { Invariant } from '../state';

/** Narrator part of the game state: the pace of events (D-045). The deck is rolled in narrator/phases.ts. */
export interface NarratorState {
  /** Event id -> day it last fired. */
  lastFired: Record<string, number>;
  lastEventDay: number | null;
}

export function initNarratorState(): NarratorState {
  return { lastFired: {}, lastEventDay: null };
}

export const narratorInvariants: Invariant = ({ state, content }) => {
  const problems: string[] = [];
  if (state.lastEventDay !== null && (!isInt(state.lastEventDay) || state.lastEventDay > state.day)) {
    problems.push(`last event day ${String(state.lastEventDay)} is not a past day`);
  }
  for (const [id, day] of Object.entries(state.lastFired)) {
    if (!content.events.some((e) => e.id === id)) problems.push(`narrator remembers unknown event ${id}`);
    if (!isInt(day) || day > state.day) problems.push(`event ${id} last fired on day ${String(day)}, not a past day`);
  }
  return problems;
};
