import { z } from 'zod';
import type { CrossCheck } from '../content/schema';
import { DayRange, Id, Text, type ContentError } from '../content/types';
import { EffectsSchema } from '../effects';
import { checkTemplate } from '../text/text';

/** Top-level content key `actions`, a list merged from all files. */
export const ActionSchema = z.strictObject({
  id: Id,
  name: Text,
  /** Duration in days, rolled when the action starts. */
  duration: DayRange,
  effects: EffectsSchema.optional(),
  /** Chronicle line written when the action completes. */
  text: Text,
});

export type ActionDef = z.infer<typeof ActionSchema>;

export const checkActions: CrossCheck = ({ actions }) => {
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
  }
  return errors;
};
