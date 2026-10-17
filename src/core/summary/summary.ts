import { isInt } from '../helpers';
import type { Invariant } from '../state';

/**
 * Snapshot of the house at the yearly reading (D-317, D-395): `[day, head, money, fame, renown, status]` — the day of
 * the reading, the id of the head, their money and fame step, the renown of the head's house and its status id (null
 * when the house has none). A tuple of whole numbers and two ids keeps a year to a few dozen bytes in the save.
 */
export type Snapshot = [day: number, head: string, money: number, fame: number, renown: number, status: string | null];

/**
 * Summary part of the game state (stage 4, D-246, D-317). `livingMax` is the most people alive at once, read once a
 * year, for the metrics (D-313); `snapshots` are the yearly readings of the house, oldest first, for the summary of
 * the house (D-395: they stay in the hot part, the archive holds only chronicle and people).
 */
export interface SummaryState {
  /** Year of the last yearly reading; null before the first summary phase. */
  summaryYear: number | null;
  /** The most living characters in the state at a yearly reading. */
  livingMax: number;
  /** One per calendar year, oldest first. */
  snapshots: Snapshot[];
}

export function initSummaryState(): SummaryState {
  return { summaryYear: null, livingMax: 0, snapshots: [] };
}

export const summaryInvariants: Invariant = ({ state }) => {
  const problems: string[] = [];
  if (!isInt(state.livingMax) || state.livingMax < 0) problems.push(`livingMax is not a whole number: ${state.livingMax}`);
  if (state.summaryYear !== null && !isInt(state.summaryYear)) problems.push(`summaryYear is not a whole number: ${state.summaryYear}`);
  let prev = -Infinity;
  state.snapshots.forEach((s, i) => {
    const [day, head, money, fame, renown, status] = s;
    if (!isInt(day) || day <= prev) problems.push(`snapshot ${i} is not after the one before it: day ${day}`);
    if (day > state.day) problems.push(`snapshot ${i} is dated in the future: day ${day}`);
    prev = day;
    if (typeof head !== 'string') problems.push(`snapshot ${i} has no head`);
    if (!isInt(money) || !isInt(renown)) problems.push(`snapshot ${i} money or renown is not a whole number`);
    if (!isInt(fame) || fame < 0 || fame > 3) problems.push(`snapshot ${i} fame out of range: ${fame}`);
    if (status !== null && typeof status !== 'string') problems.push(`snapshot ${i} status is not an id`);
  });
  return problems;
};
