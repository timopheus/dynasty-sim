import { getPlayer } from '../helpers';
import { houseById } from '../house/house';
import type { DayPhase, GameState } from '../state';
import { toYmd } from '../time/calendar';
import type { Snapshot } from './summary';

/** The house of the current head as it stands now (D-317). Pure. */
export function takeSnapshot(state: GameState): Snapshot {
  const head = getPlayer(state);
  const house = houseById(state, head.house);
  return [state.day, head.id, head.money, head.fame, house?.renown ?? 0, house?.status ?? null];
}

/**
 * Summary phase: once a year (the first day the phase sees in a new year, so a stop earlier in the day does not skip
 * it) it counts the living for `livingMax` and takes the snapshot of the house (D-317, D-395). No randomness, never
 * stops the day.
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
    state.snapshots.push(takeSnapshot(state));
    return false;
  },
};
