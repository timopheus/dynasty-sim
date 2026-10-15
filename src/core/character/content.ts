import { z } from 'zod';
import type { CrossCheck } from '../content/schema';
import { Text } from '../content/types';

/** Top-level content key `names`, defined exactly once. */
export const NamesSchema = z.strictObject({
  given: z.array(Text).min(1),
  surnames: z.array(Text).min(1),
});

/** Top-level content key `traits`, a list merged from all files; the item schema is filled by 2.3. */
export const TraitSchema = z.strictObject({});

export type Names = z.infer<typeof NamesSchema>;

export const checkCharacter: CrossCheck = () => [];
