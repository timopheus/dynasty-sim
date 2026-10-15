import type { Character, Ctx } from '../state';

/**
 * Effect keys of this module (`end_action`); filled by 2.2.
 * Like every file that feeds effects.ts, it must not import effects.ts (import cycle).
 */
export const actionsEffectShape = {};

export function applyActionsEffects(_ctx: Ctx, _c: Character, _effects: object): void {}
