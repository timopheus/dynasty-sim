import type { Character, Ctx, Scope } from '../state';

/**
 * Effect keys of this module: none yet. The slot is wired into effects.ts (S.9a) so that S.9 adds its keys here without
 * touching the assembly file. Like every file that feeds effects.ts, this one must not import effects.ts (import cycle).
 */
export const placeEffectShape = {};

export function applyPlaceEffects(_ctx: Ctx, _c: Character, _effects: object, _scope: Scope): void {}
