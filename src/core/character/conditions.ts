import { z } from 'zod';
import type { Character, Ctx } from '../state';
import { SexSchema } from './content';

/** Condition keys of this module (D-054): `sex` limits an action or event to one sex. */
export const characterConditionShape = {
  sex: SexSchema.optional(),
};

/** The reason is a content text (`names.requiresSex`) when the character is of the other sex. */
export function checkCharacterConditions(ctx: Ctx, c: Character, when: { sex?: z.infer<typeof SexSchema> | undefined }): string[] {
  if (when.sex === undefined || c.sex === when.sex) return [];
  return [ctx.content.names.requiresSex[when.sex]];
}
