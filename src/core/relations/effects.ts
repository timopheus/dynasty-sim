import type { Character, Ctx, Scope } from '../state';

/**
 * Effect keys of this module: `opinion`, `opinion_end`, `relation`, `secret`, `reveal`, `introduce` (3.6).
 * The other person of each key is a role of the scope. Like every file that feeds effects.ts, it must not
 * import effects.ts (import cycle). Empty in 3.1.
 */
export const relationsEffectShape = {};

export function applyRelationsEffects(_ctx: Ctx, _c: Character, _effects: object, _scope: Scope): void {}

/** Roles the effects refer to (`toward`, `with`, `known_by`, `to`), for the cross-check of events. */
export function relationsEffectRoleRefs(_effects: object): string[] {
  return [];
}
