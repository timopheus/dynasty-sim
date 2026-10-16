import type { Character, Ctx, Scope } from '../state';

/**
 * Effect keys of this module: none yet (4.1 wires the point, 4.11 fills it). A key that names another person names a
 * role of the scope and returns it from `eraEffectRoleRefs` (D-162, D-171).
 */
export const eraEffectShape = {};

export function applyEraEffects(_ctx: Ctx, _c: Character, _effects: object, _scope: Scope): void {}

/** Roles the keys of this module refer to, for the cross-check of events. */
export function eraEffectRoleRefs(_effects: object): string[] {
  return [];
}
