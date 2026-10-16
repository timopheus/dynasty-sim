import { isInt } from '../helpers';
import type { Invariant } from '../state';

/** Counters of the pace for the metrics (3.7): what the narrator started, by the length of the action. */
export interface NarratorStats {
  /** Actions the narrator saw run, and events with a choice started in them; short and long as in D-168. */
  shortActions: number;
  shortEvents: number;
  longActions: number;
  longEvents: number;
  /** Heavy events and notices started (any action). */
  heavy: number;
  notices: number;
}

/** Narrator part of the game state: the pace of events (D-045, D-230). The deck is rolled in narrator/phases.ts. */
export interface NarratorState {
  /** Event id -> day it last fired. Entries stay for good: `once: game` reads them. */
  lastFired: Record<string, number>;
  lastEventDay: number | null;
  /** Tension on `tensionDay`; it fades with the days since (D-231). */
  tension: number;
  tensionDay: number;
  /** Head of the house whose life `lifeFired` describes, and the events with `once: life` fired in it. */
  lifeHero: string | null;
  lifeFired: string[];
  /** Day the hero was first seen at the bottom, null while not; day of the last `way_up` event (D-233). */
  bottomSince: number | null;
  lastWayUpDay: number | null;
  /** `endDay` of the action counted last in `stats`: it identifies the action. */
  seenActionEnd: number | null;
  narratorStats: NarratorStats;
}

export function initNarratorState(): NarratorState {
  return {
    lastFired: {},
    lastEventDay: null,
    tension: 0,
    tensionDay: 0,
    lifeHero: null,
    lifeFired: [],
    bottomSince: null,
    lastWayUpDay: null,
    seenActionEnd: null,
    narratorStats: { shortActions: 0, shortEvents: 0, longActions: 0, longEvents: 0, heavy: 0, notices: 0 },
  };
}

const isPastDay = (value: unknown, today: number): boolean => isInt(value) && value <= today;

export const narratorInvariants: Invariant = ({ state }) => {
  const problems: string[] = [];
  if (state.lastEventDay !== null && !isPastDay(state.lastEventDay, state.day)) {
    problems.push(`last event day ${String(state.lastEventDay)} is not a past day`);
  }
  // An event removed from the content may stay here: the roll walks content.events, and a save must still load.
  for (const [id, day] of Object.entries(state.lastFired)) {
    if (!isPastDay(day, state.day)) problems.push(`event ${id} last fired on day ${String(day)}, not a past day`);
  }
  if (!isInt(state.tension) || state.tension < 0) problems.push(`tension is ${String(state.tension)}`);
  if (!isPastDay(state.tensionDay, state.day)) problems.push(`tension day ${String(state.tensionDay)} is not a past day`);
  for (const [name, day] of [['bottomSince', state.bottomSince], ['lastWayUpDay', state.lastWayUpDay]] as const) {
    if (day !== null && !isPastDay(day, state.day)) problems.push(`${name} ${String(day)} is not a past day`);
  }
  if (state.lifeHero !== null && !state.characters.some((c) => c.id === state.lifeHero)) problems.push(`life of unknown character ${state.lifeHero}`);
  for (const [name, n] of Object.entries(state.narratorStats)) {
    if (!isInt(n) || n < 0) problems.push(`counter ${name} is ${String(n)}`);
  }
  return problems;
};
