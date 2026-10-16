import { botCommand } from './bot';
import { formatDate, fromYmd, START_YEAR } from './time/calendar';
import type { Content } from './content/schema';
import { apply, newGame } from './game';
import { checkInvariants } from './invariants';
import type { GameState } from './state';
import { seedRng } from './rng';

export interface SimOptions {
  seed: number;
  years: number;
}

/** Steps in a row that may pass without time moving: pages of an event, scenes of the backstory. More is a hang. */
export const MAX_STEPS_WITHOUT_TIME = 50;

export interface SimResult {
  state: GameState;
  steps: number;
  violations: string[];
}

/** Headless run: a random bot plays until the given number of years has passed. */
export function runSim(content: Content, { seed, years }: SimOptions): SimResult {
  if (!Number.isInteger(years) || years < 1) throw new Error(`years must be a positive integer, got ${years}`);
  const state = newGame(seed, content);
  const botRng = seedRng(seed, 1);
  const endDay = fromYmd(START_YEAR + years, 1, 1);
  const violations = checkInvariants(state, content);
  let steps = 0;
  let still = 0;
  while (state.day < endDay && violations.length === 0) {
    const prevDay = state.day;
    const cmd = botCommand(state, content, botRng);
    apply(state, content, cmd);
    steps += 1;
    // A choice may leave time where it was (another page, a scene, the first action to pick); an action may not.
    if (state.day > prevDay) still = 0;
    else if (cmd.type === 'start') violations.push(`step ${steps}: time did not advance from day ${prevDay}`);
    else if (++still > MAX_STEPS_WITHOUT_TIME) violations.push(`step ${steps}: ${still} choices in a row without time moving from day ${prevDay}`);
    for (const v of checkInvariants(state, content)) violations.push(`step ${steps}, ${formatDate(state.day)}: ${v}`);
  }
  return { state, steps, violations };
}
