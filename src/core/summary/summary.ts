import { isInt } from '../helpers';
import type { Invariant } from '../state';

/**
 * Summary part of the game state (stage 4, D-246, D-317). 4.1 keeps only the most people alive at once, read once a
 * year, for the metrics (D-313: the ceiling of the living); 4.14 adds the yearly snapshot of the house.
 */
export interface SummaryState {
  /** Year of the last yearly reading; null before the first summary phase. */
  summaryYear: number | null;
  /** The most living characters in the state at a yearly reading. */
  livingMax: number;
}

export function initSummaryState(): SummaryState {
  return { summaryYear: null, livingMax: 0 };
}

export const summaryInvariants: Invariant = ({ state }) => {
  const problems: string[] = [];
  if (!isInt(state.livingMax) || state.livingMax < 0) problems.push(`livingMax is not a whole number: ${state.livingMax}`);
  if (state.summaryYear !== null && !isInt(state.summaryYear)) problems.push(`summaryYear is not a whole number: ${state.summaryYear}`);
  return problems;
};
