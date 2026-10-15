import { z } from 'zod';
import type { Character, Ctx } from '../state';

/** Effect keys of this module; effects.ts merges them into the content schema. */
export const characterEffectShape = {
  money: z.int().optional(),
};

export function applyCharacterEffects(_ctx: Ctx, c: Character, effects: { money?: number | undefined }): void {
  if (effects.money !== undefined) c.money += effects.money;
}
