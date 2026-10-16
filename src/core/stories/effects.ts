import type { Character, Ctx, Scope } from '../state';

/**
 * Effect keys of this module: `schedule` and `story` (3.8). Like every file that feeds effects.ts, it must
 * not import effects.ts or events/ (import cycle). Empty in 3.1.
 */
export const storiesEffectShape = {};

export function applyStoriesEffects(_ctx: Ctx, _c: Character, _effects: object, _scope: Scope): void {}

/** Roles the effects refer to (`schedule.roles`), for the cross-check of events. */
export function storiesEffectRoleRefs(_effects: object): string[] {
  return [];
}
