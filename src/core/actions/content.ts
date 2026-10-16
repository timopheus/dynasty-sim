import { z } from 'zod';
import type { CrossCheck } from '../content/schema';
import { DayRange, Id, Text, type ContentError } from '../content/types';
import { WhenSchema } from '../condition-keys';
import { EffectsSchema } from '../effects';
import { checkTemplate } from '../text/text';

/** Top-level content key `actions`, a list merged from all files. */
export const ActionSchema = z.strictObject({
  id: Id,
  name: Text,
  /** Duration in days, rolled when the action starts. */
  duration: DayRange,
  /** Conditions to start the action (D-040, D-054); unmet ones are shown as reasons (D-043). */
  when: WhenSchema.optional(),
  effects: EffectsSchema.optional(),
  /** Chronicle line written when the action completes. */
  text: Text,
});

export type ActionDef = z.infer<typeof ActionSchema>;

export const checkActions: CrossCheck = ({ actions, time }) => {
  const seasonIds = new Set(time.flatMap((t) => t.item.seasons.map((s) => s.id)));
  const errors: ContentError[] = [];
  if (actions.length === 0) {
    errors.push({ file: '(content)', path: 'actions', message: 'at least one action is required' });
  }
  const ids = new Set<string>();
  for (const { file, index, item } of actions) {
    if (ids.has(item.id)) errors.push({ file, path: `actions[${index}].id`, message: `duplicate action id "${item.id}"` });
    ids.add(item.id);
    const problem = checkTemplate(item.text);
    if (problem) errors.push({ file, path: `actions[${index}].text`, message: problem });
    const { when } = item;
    if (!when) continue;
    when.season?.forEach((id, i) => {
      if (!seasonIds.has(id)) errors.push({ file, path: `actions[${index}].when.season[${i}]`, message: `unknown season "${id}"` });
    });
    if (when.age_min !== undefined && when.age_max !== undefined && when.age_min > when.age_max) {
      errors.push({ file, path: `actions[${index}].when.age_max`, message: 'age_max must be >= age_min' });
    }
  }
  return errors;
};
