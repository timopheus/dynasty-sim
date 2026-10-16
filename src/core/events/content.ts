import { z } from 'zod';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';
import { EffectsSchema } from '../effects';
import { checkTemplate } from '../text/text';

export const OptionSchema = z.strictObject({
  /** Button label shown to the player. */
  text: Text,
  /** Chronicle line written when this option is chosen. */
  result: Text,
  effects: EffectsSchema.optional(),
});

/** Top-level content key `events`, a list merged from all files. */
export const EventSchema = z.strictObject({
  id: Id,
  weight: Int.min(1),
  /** If set, the event can only fire during these actions. */
  actions: z.array(Id).min(1).optional(),
  text: Text,
  options: z.array(OptionSchema).min(1),
});

export type OptionDef = z.infer<typeof OptionSchema>;
export type EventDef = z.infer<typeof EventSchema>;

export const checkEvents: CrossCheck = ({ actions, events }) => {
  const errors: ContentError[] = [];
  const actionIds = new Set(actions.map((a) => a.item.id));
  const ids = new Set<string>();
  for (const { file, index, item } of events) {
    const at = `events[${index}]`;
    if (ids.has(item.id)) errors.push({ file, path: `${at}.id`, message: `duplicate event id "${item.id}"` });
    ids.add(item.id);
    item.actions?.forEach((ref, i) => {
      if (!actionIds.has(ref)) errors.push({ file, path: `${at}.actions[${i}]`, message: `unknown action "${ref}"` });
    });
    const templates: [string, string][] = [[`${at}.text`, item.text]];
    item.options.forEach((option, i) => {
      templates.push([`${at}.options[${i}].text`, option.text], [`${at}.options[${i}].result`, option.result]);
    });
    for (const [path, text] of templates) {
      const problem = checkTemplate(text);
      if (problem) errors.push({ file, path, message: problem });
    }
  }
  return errors;
};
