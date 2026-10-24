import type { Content } from '../content/schema';
import { isInt } from '../helpers';
import { houseOf } from '../house/house';
import { toYmd } from '../time/calendar';
import type { Character, GameState, Invariant } from '../state';
import { crownsAt, type PriceRefValue } from './content';

/**
 * Economy (D-326, D-441). S.5a wires the points — the part of the state, the phase, the keys `pay`, `gain` and
 * `can_afford`, the content key — with the simplest contract; S.7 brings the monthly balance. The part of the state is
 * this module's own: S.7 may change it.
 * - `balance`: the last monthly balance of the hero, in crowns; null before the first month;
 * - `month`: the month the phase has seen last, `year × 12 + month − 1`; null before the first day it runs;
 * - `debtYear`: the year of the last chronicle line about debt, so there is one at most a year; null if none.
 */
export interface EconomyState {
  economy: { balance: number | null; month: number | null; debtYear: number | null };
}

export function initEconomyState(): EconomyState {
  return { economy: { balance: null, month: null, debtYear: null } };
}

/** Income of a status; the lowest status of the house (`house.statuses[0]`) when it is null or unknown. */
function incomeOf(content: Content, status: string | null): number {
  const economy = content.economy;
  if (!economy) return 0;
  const lowest = content.house?.statuses[0]?.id ?? null;
  const entry = economy.income.find((i) => i.status === status) ?? economy.income.find((i) => i.status === lowest) ?? economy.income[0];
  return entry?.crowns ?? 0;
}

/** Monthly reference income R of a character: by the status of their house, the lowest one without a house. */
export function referenceIncome(content: Content, state: GameState, c: Character): number {
  return incomeOf(content, houseOf(state, c)?.status ?? null);
}

/** Crowns a price costs this character now; 0 without the key `economy`. Never consumes randomness. */
export function priceCrowns(content: Content, state: GameState, c: Character, ref: PriceRefValue): number {
  const economy = content.economy;
  return economy ? crownsAt(economy, referenceIncome(content, state, c), ref) : 0;
}

/** Crowns of a price at the lowest income, for those who see content without a game: the bots (D-247). */
export function lowestCrowns(content: Content, ref: PriceRefValue): number {
  const economy = content.economy;
  return economy ? crownsAt(economy, incomeOf(content, null), ref) : 0;
}

export const economyInvariants: Invariant = ({ state }) => {
  const { balance, month, debtYear } = state.economy;
  const problems: string[] = [];
  if (balance !== null && !isInt(balance)) problems.push(`economy: balance is not a whole number: ${String(balance)}`);
  if (month !== null && !isInt(month)) problems.push(`economy: month is not a whole number: ${String(month)}`);
  if (month !== null && isInt(month)) {
    const { year, month: m } = toYmd(state.day);
    if (month > year * 12 + m - 1) problems.push(`economy: month ${month} is later than today`);
  }
  if (debtYear !== null && !isInt(debtYear)) problems.push(`economy: debtYear is not a whole number: ${String(debtYear)}`);
  return problems;
};
