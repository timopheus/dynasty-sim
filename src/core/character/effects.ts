import { z } from 'zod';
import { Id } from '../content/types';
import type { Character, Ctx, Scope } from '../state';
import { addTrait, removeTrait } from './traits';

/** Effect keys of this module; effects.ts merges them into the content schema. */
export const characterEffectShape = {
  money: z.int().optional(),
  /** Takes traits away, then gives traits; a new trait removes its opposite (D-032). */
  traits: z
    .strictObject({ add: z.array(Id).min(1).optional(), remove: z.array(Id).min(1).optional() })
    .refine((t) => t.add !== undefined || t.remove !== undefined, { message: 'add or remove is needed' })
    .optional(),
};

export function applyCharacterEffects(
  ctx: Ctx,
  c: Character,
  effects: { money?: number | undefined; traits?: { add?: string[] | undefined; remove?: string[] | undefined } | undefined },
  _scope: Scope,
): void {
  if (effects.money !== undefined) c.money += effects.money;
  for (const id of effects.traits?.remove ?? []) removeTrait(ctx, c, id);
  for (const id of effects.traits?.add ?? []) addTrait(ctx, c, id);
}
