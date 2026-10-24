import type { Unmet } from '../condition-keys';
import { fillReason } from '../conditions/reasons';
import type { Character, Ctx, Scope } from '../state';
import { PriceRef, type PriceRefValue } from './content';
import { priceCrowns } from './economy';

/**
 * Condition key of this module (D-441); it names nobody else:
 * - `can_afford: <level> | {level, times}` — the character has at least the price. Unmet: an option shown grey with
 *   «Requires N crowns» (`economy.reasons.afford`), which the hero knows.
 */
export const economyConditionShape = {
  can_afford: PriceRef.optional(),
};

interface EconomyWhen {
  can_afford?: PriceRefValue | undefined;
}

export function checkEconomyConditions(ctx: Ctx, c: Character, when: EconomyWhen, _scope: Scope): Unmet[] {
  if (when.can_afford === undefined) return [];
  const { state, content } = ctx;
  const economy = content.economy;
  if (!economy) return [{ text: '', hidden: true }];
  const crowns = priceCrowns(content, state, c, when.can_afford);
  return c.money >= crowns ? [] : [{ text: fillReason(economy.reasons.afford, { crowns: String(crowns) }), hidden: false }];
}

/** Roles the keys of this module refer to, for the cross-check of events: none. */
export function economyConditionRoleRefs(_when: object): string[] {
  return [];
}
