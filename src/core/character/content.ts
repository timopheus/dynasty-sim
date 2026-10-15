import { z } from 'zod';
import { Text } from '../content/types';

/** Top-level content key `names`, defined exactly once. */
export const NamesSchema = z.strictObject({
  given: z.array(Text).min(1),
  surnames: z.array(Text).min(1),
});

export type Names = z.infer<typeof NamesSchema>;
