import { botCommand } from './bot';
import { formatDate, fromYmd, START_YEAR } from './calendar';
import type { Content } from './content/schema';
import { apply, checkInvariants, newGame, type GameState } from './game';
import { seedRng } from './rng';

export interface SimOptions {
  seed: number;
  years: number;
}

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
  while (state.day < endDay && violations.length === 0) {
    const prevDay = state.day;
    apply(state, content, botCommand(state, content, botRng));
    steps += 1;
    if (state.day <= prevDay) violations.push(`step ${steps}: time did not advance from day ${prevDay}`);
    for (const v of checkInvariants(state, content)) violations.push(`step ${steps}, ${formatDate(state.day)}: ${v}`);
  }
  return { state, steps, violations };
}
