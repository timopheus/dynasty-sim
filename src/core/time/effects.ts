import { z } from 'zod';
import { Int } from '../content/types';
import type { Effects } from '../effects';
import type { Character, Ctx, Scope } from '../state';

/**
 * Effect keys of this module: `later: [{after_days, effects}]` queues effects for the
 * same character (D-053) with the same scope of roles. `effects` is the full effects schema
 * (lazy), so `later` can nest effects without importing effects.ts: every file that feeds
 * effects.ts must not import it (import cycle).
 */
export function timeEffectShape(effects: z.ZodType) {
  return {
    later: z.array(z.strictObject({ after_days: Int.min(1), effects })).min(1).optional(),
  };
}

export function applyTimeEffects({ state }: Ctx, c: Character, effects: { later?: { after_days: number; effects: unknown }[] | undefined }, scope: Scope): void {
  for (const entry of effects.later ?? []) {
    state.scheduled.push({ dueDay: state.day + entry.after_days, characterId: c.id, effects: entry.effects as Effects, scope });
  }
}
