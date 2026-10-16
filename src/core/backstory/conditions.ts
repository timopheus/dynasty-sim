import type { Unmet } from '../condition-keys';
import { Id } from '../content/types';
import type { Character, Ctx, Scope } from '../state';

/**
 * Condition keys of this module (3.11): `offered: <variant>` — the variant was among those offered to the player in
 * this game (D-167). A variant that was not offered is a hidden reason (D-043): the option is not shown.
 */
export const backstoryConditionShape = { offered: Id.optional() };

export function checkBackstoryConditions(ctx: Ctx, _c: Character, when: { offered?: string | undefined }, _scope: Scope): Unmet[] {
  if (when.offered === undefined || ctx.state.backstory.offered.includes(when.offered)) return [];
  return [{ text: `Not on offer: ${when.offered}`, hidden: true }];
}
