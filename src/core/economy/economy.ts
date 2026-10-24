import type { Content } from '../content/schema';
import { isInt } from '../helpers';
import { houseOf } from '../house/house';
import type { Character, GameState, Invariant } from '../state';
import { crownsAt, type PriceRefValue } from './content';

/**
 * Economy (D-326, D-441). S.5a wires the points — the part of the state, the phase, the keys `pay`, `gain` and
 * `can_afford`, the content key — with the simplest contract; S.7 brings the monthly balance. The part of the state is
 * this module's own: S.7 may change it.
 * - `balance`: the last monthly balance of the hero, in crowns; null before the first month.
 */
export interface EconomyState {
  economy: { balance: number | null };
}

export function initEconomyState(): EconomyState {
  return { economy: { balance: null } };
}

/** Monthly reference income R of a character: by the status of their house, the lowest one without a house. */
export function referenceIncome(content: Content, state: GameState, c: Character): number {
  const economy = content.economy;
  if (!economy) return 0;
  const status = houseOf(state, c)?.status ?? null;
  return (economy.income.find((i) => i.status === status) ?? economy.income[0])?.crowns ?? 0;
}

/** Crowns a price costs this character now; 0 without the key `economy`. Never consumes randomness. */
export function priceCrowns(content: Content, state: GameState, c: Character, ref: PriceRefValue): number {
  const economy = content.economy;
  return economy ? crownsAt(economy, referenceIncome(content, state, c), ref) : 0;
}

/** Crowns of a price at the lowest income, for those who see content without a game: the bots (D-247). */
export function lowestCrowns(content: Content, ref: PriceRefValue): number {
  const economy = content.economy;
  return economy ? crownsAt(economy, economy.income[0]?.crowns ?? 0, ref) : 0;
}

export const economyInvariants: Invariant = ({ state }) => {
  const b = state.economy.balance;
  return b === null || isInt(b) ? [] : [`economy: balance is not a whole number: ${String(b)}`];
};
