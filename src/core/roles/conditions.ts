import type { Unmet } from '../condition-keys';
import type { Character, Ctx, Scope } from '../state';

/** Condition keys of this module: `occupation` (3.3). Must not import condition-keys.ts at run time. Empty in 3.1. */
export const rolesConditionShape = {};

export function checkRolesConditions(_ctx: Ctx, _c: Character, _when: object, _scope: Scope): Unmet[] {
  return [];
}
