import type { Character, Ctx, Scope } from '../state';
import { PriceRef, type PriceRefValue } from './content';
import { priceCrowns } from './economy';

/**
 * Effect keys of this module (D-441), applied to the character of the block; neither names another person. Like every
 * file that feeds effects.ts, this one must not import effects.ts (import cycle).
 * - `pay: <level> | {level, times}` — the character pays the price (money may go below zero, as with `money`);
 * - `gain: <level> | {level, times}` — the character gets it.
 * The price is a part of the character's reference income, by the status of their house (`economy.ts`).
 */
export const economyEffectShape = {
  pay: PriceRef.optional(),
  gain: PriceRef.optional(),
};

interface EconomyEffects {
  pay?: PriceRefValue | undefined;
  gain?: PriceRefValue | undefined;
}

export function applyEconomyEffects(ctx: Ctx, c: Character, effects: EconomyEffects, _scope: Scope): void {
  const { state, content } = ctx;
  if (effects.pay !== undefined) c.money -= priceCrowns(content, state, c, effects.pay);
  if (effects.gain !== undefined) c.money += priceCrowns(content, state, c, effects.gain);
}

/** Roles the keys of this module refer to, for the cross-check of events: none. */
export function economyEffectRoleRefs(_effects: object): string[] {
  return [];
}
