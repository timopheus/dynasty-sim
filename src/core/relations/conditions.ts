import type { Unmet } from '../condition-keys';
import type { Character, Ctx, Scope } from '../state';

/**
 * Condition keys of this module: `opinion`, `relation`, `relation_none`, `acquainted` (3.6). The other person
 * is a role of the scope; what the hero cannot know gives a hidden reason. Empty in 3.1.
 */
export const relationsConditionShape = {};

export function checkRelationsConditions(_ctx: Ctx, _c: Character, _when: object, _scope: Scope): Unmet[] {
  return [];
}

/** Roles the conditions refer to (`toward`, `with`), for the cross-check of events. */
export function relationsConditionRoleRefs(_when: object): string[] {
  return [];
}
