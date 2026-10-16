import type { Unmet } from '../condition-keys';
import type { Character, Ctx, Scope } from '../state';

/**
 * Condition keys of this module: none yet (4.1 wires the point, 4.11 fills it). A key that names another person names
 * a role of the scope and returns it from `eraConditionRoleRefs` (D-162, D-171).
 */
export const eraConditionShape = {};

export function checkEraConditions(_ctx: Ctx, _c: Character, _when: object, _scope: Scope): Unmet[] {
  return [];
}

/** Roles the keys of this module refer to, for the cross-check of events. */
export function eraConditionRoleRefs(_when: object): string[] {
  return [];
}
