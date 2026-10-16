import type { Unmet } from '../condition-keys';
import type { Character, Ctx, Scope } from '../state';

/**
 * Condition keys of this module (3.11): for example which origins the backstory offers the player (D-167). Empty in
 * 3.1d, the point 3.11 fills. Must not import condition-keys.ts at run time.
 */
export const backstoryConditionShape = {};

export function checkBackstoryConditions(_ctx: Ctx, _c: Character, _when: object, _scope: Scope): Unmet[] {
  return [];
}
