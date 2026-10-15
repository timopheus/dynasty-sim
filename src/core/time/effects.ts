import type { z } from 'zod';
import type { Character, Ctx } from '../state';

/**
 * Effect keys of this module (`later: [{after_days, effects}]`, D-053); filled by 2.2.
 * `effects` is the full effects schema (lazy), so `later` can nest effects without
 * importing effects.ts: every file that feeds effects.ts must not import it (import cycle).
 */
export function timeEffectShape(_effects: z.ZodType) {
  return {};
}

export function applyTimeEffects(_ctx: Ctx, _c: Character, _effects: object): void {}
