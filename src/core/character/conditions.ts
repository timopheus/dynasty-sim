import { z } from 'zod';
import type { Unmet } from '../condition-keys';
import type { Character, Ctx, Scope } from '../state';
import { SexSchema } from './content';

/** Condition keys of this module (D-054): `sex` limits an action or event to one sex. */
export const characterConditionShape = {
  sex: SexSchema.optional(),
};

/** The reason is a content text (`names.requiresSex`) when the character is of the other sex. */
export function checkCharacterConditions(ctx: Ctx, c: Character, when: { sex?: z.infer<typeof SexSchema> | undefined }, _scope: Scope): Unmet[] {
  if (when.sex === undefined || c.sex === when.sex) return [];
  return [{ text: ctx.content.names.requiresSex[when.sex], hidden: false }];
}
