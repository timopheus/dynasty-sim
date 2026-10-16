import type { Character, Ctx, Scope } from '../state';

/**
 * Effect keys of this module: none yet (4.1 wires the point, 4.9 fills it). A key that names another person names a
 * role of the scope and returns it from `heirloomEffectRoleRefs` (D-162, D-171).
 */
export const heirloomEffectShape = {};

export function applyHeirloomEffects(_ctx: Ctx, _c: Character, _effects: object, _scope: Scope): void {}

/** Roles the keys of this module refer to, for the cross-check of events. */
export function heirloomEffectRoleRefs(_effects: object): string[] {
  return [];
}
