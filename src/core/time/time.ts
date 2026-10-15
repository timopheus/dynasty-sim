import type { Character, Ctx, DayPhase, Invariant } from '../state';
import { toYmd } from './calendar';

/** Time part of the game state; the queue of scheduled effects arrives with 2.2 (D-053). */
export interface TimeState {}

export function initTimeState(): TimeState {
  return {};
}

export function isNewYear(day: number): boolean {
  const { month, day: d } = toYmd(day);
  return month === 1 && d === 1;
}

export const newDayPhase: DayPhase = {
  id: 'new_day',
  run({ state }) {
    state.day += 1;
    return false;
  },
};

/** Scheduled effects due today; filled by 2.2. */
export const scheduledPhase: DayPhase = { id: 'scheduled', run: () => false };

/** Condition keys of this module (D-054): season, filled by 2.2. */
export const timeConditionShape = {};

export const timeInvariants: Invariant = () => [];

export function checkTimeConditions(_ctx: Ctx, _c: Character, _when: object): string[] {
  return [];
}
