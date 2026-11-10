import { z } from 'zod';
import type { Unmet } from '../condition-keys';
import { Id } from '../content/types';
import type { Character, Ctx, Scope } from '../state';

/**
 * Condition keys of this module (3.11): `offered: <variant>` — the variant was among those offered to the player in
 * this game (D-167). A variant that was not offered is a hidden reason (D-043): the option is not shown.
 * `backstory_only: true` — never met by the player's choice, a hidden reason: the action `early_years` (D-479) is set
 * by the backstory itself while the founder waits for the next scene, and nobody may start it.
 */
export const backstoryConditionShape = { offered: Id.optional(), backstory_only: z.literal(true).optional() };

export function checkBackstoryConditions(ctx: Ctx, _c: Character, when: { offered?: string | undefined; backstory_only?: true | undefined }, _scope: Scope): Unmet[] {
  const unmet: Unmet[] = [];
  if (when.backstory_only) unmet.push({ text: 'Only the backstory sets this', hidden: true });
  if (when.offered !== undefined && !ctx.state.backstory.offered.includes(when.offered)) unmet.push({ text: `Not on offer: ${when.offered}`, hidden: true });
  return unmet;
}
