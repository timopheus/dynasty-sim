import type { Unmet } from '../condition-keys';
import type { Character, Ctx, Scope } from '../state';

/**
 * Condition keys of this module: none yet (4.1 wires the point, 4.5 fills it). A key that names another person names
 * a role of the scope and returns it from `familyConditionRoleRefs` (D-162, D-171).
 */
export const familyConditionShape = {};

export function checkFamilyConditions(_ctx: Ctx, _c: Character, _when: object, _scope: Scope): Unmet[] {
  return [];
}

/** Roles the keys of this module refer to, for the cross-check of events. */
export function familyConditionRoleRefs(_when: object): string[] {
  return [];
}
