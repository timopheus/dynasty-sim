import { z } from 'zod';
import { checkReason } from '../conditions/reasons';
import { walkKeys } from '../conditions/walk';
import type { CrossCheck } from '../content/schema';
import { Int, Text, type ContentError } from '../content/types';

/**
 * Optional top-level key `favors` (CK.2a, D-474):
 * - `weakDays`: how long a weak favor may be called in (10 years);
 * - `strongRestDays`: how long a strong favor rests after it is called in (5 years);
 * - `reasons`: texts of unmet `favor_with` — `none` (no favor of the person, `{name}`) and `strong` (no strong one, `{name}`).
 */
export const FavorsContentSchema = z.strictObject({
  weakDays: Int.min(1),
  strongRestDays: Int.min(1),
  reasons: z.strictObject({ none: Text, strong: Text }),
});

export type FavorsContent = z.infer<typeof FavorsContentSchema>;

/** Keys of conditions and effects of the module (`conditions.ts`, `effects.ts`): they need the key `favors`. */
const KEYS = ['favor_with', 'favor', 'favor_use'];

export const checkFavors: CrossCheck = (sources) => {
  const errors: ContentError[] = [];
  for (const { file, item } of sources.favors) {
    for (const key of ['none', 'strong'] as const) {
      const problem = checkReason(item.reasons[key], ['name']);
      if (problem) errors.push({ file, path: `favors.reasons.${key}`, message: problem });
    }
  }
  if (sources.favors.length > 0) return errors;
  const users: { file: string; base: string; item: unknown }[] = [
    ...sources.events.map((e) => ({ file: e.file, base: `events[${e.index}]`, item: e.item as unknown })),
    ...sources.actions.map((a) => ({ file: a.file, base: `actions[${a.index}]`, item: a.item as unknown })),
    ...sources.contracts.map((c) => ({ file: c.file, base: 'contracts', item: c.item as unknown })),
    ...sources.interactions.map((c) => ({ file: c.file, base: 'interactions', item: c.item as unknown })),
  ];
  for (const { file, base, item } of users) {
    walkKeys(item, base, KEYS, (_v, path) => errors.push({ file, path, message: 'favors need the top-level key "favors"' }));
  }
  return errors;
};
