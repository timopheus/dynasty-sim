/**
 * Assembly file (D-052): effect keys of all modules. A module declares its keys
 * (zod shape) and a function that applies them; this file merges the shapes into
 * the content schema and applies effects module by module in a fixed order.
 */
import { z } from 'zod';
import { applyCharacterEffects, characterEffectShape } from './character/effects';
import { applyHealthEffects, healthEffectShape } from './health/health';
import type { Character, Ctx } from './state';

export const EffectsSchema = z.strictObject({
  ...healthEffectShape,
  ...characterEffectShape,
});

export type Effects = z.infer<typeof EffectsSchema>;

const APPLY: readonly ((ctx: Ctx, c: Character, effects: Effects) => void)[] = [applyHealthEffects, applyCharacterEffects];

export function applyEffects(ctx: Ctx, c: Character, effects: Effects | undefined): void {
  if (!effects) return;
  for (const apply of APPLY) apply(ctx, c, effects);
}
