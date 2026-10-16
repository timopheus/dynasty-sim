import type { DayPhase } from '../state';
import { toYmd } from '../time/calendar';

/**
 * Summary phase: once a year (the first day the phase sees in a new year, so a stop earlier in the day does not skip
 * it) it counts the living for `livingMax`. 4.14 adds the yearly snapshot (D-317) here. No randomness, never stops
 * the day.
 */
export const summaryPhase: DayPhase = {
  id: 'summary',
  run({ state }) {
    const year = toYmd(state.day).year;
    if (state.summaryYear === year) return false;
    state.summaryYear = year;
    let living = 0;
    for (const c of state.characters) if (c.deathDay === null) living += 1;
    if (living > state.livingMax) state.livingMax = living;
    return false;
  },
};
