import { z } from 'zod';
import { checkReason } from '../conditions/reasons';
import { walkKeys } from '../conditions/walk';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';

/**
 * Optional top-level key `mind` (D-457, D-460; points of S.9a, filled by S.10):
 * - `happiness`: the range of the hero's happiness and the base a new head starts from;
 * - `acts`: the closed list of kinds of deeds an option of an event may name in `acts:` (lie, flee, …); S.10 adds the
 *   table of which traits each deed goes against and what it costs (`docs/reference/against-nature.md`);
 * - `reasons`: texts of the unmet conditions `happiness_min` and `happiness_max` (`{value}`).
 */
export const MindContentSchema = z.strictObject({
  happiness: z.strictObject({ min: Int, max: Int, base: Int }),
  acts: z.array(z.strictObject({ id: Id, name: Text })),
  reasons: z.strictObject({ happiness_min: Text, happiness_max: Text }),
});

export type MindContent = z.infer<typeof MindContentSchema>;

/** Keys of effects and conditions of this module, which need the key `mind`. */
const MIND_KEYS = ['happiness', 'happiness_min', 'happiness_max'];

export const checkMind: CrossCheck = ({ mind, events, actions }) => {
  const errors: ContentError[] = [];
  const actIds = new Set<string>();
  for (const { file, item } of mind) {
    const err = (path: string, message: string) => errors.push({ file, path: `mind.${path}`, message });
    const { min, max, base } = item.happiness;
    if (min >= max) err('happiness.max', 'max must be above min');
    else if (base < min || base > max) err('happiness.base', `the base must be within ${min}…${max}`);
    item.acts.forEach((a, i) => {
      if (actIds.has(a.id)) err(`acts[${i}].id`, `duplicate deed "${a.id}"`);
      actIds.add(a.id);
    });
    for (const key of ['happiness_min', 'happiness_max'] as const) {
      const problem = checkReason(item.reasons[key], ['value']);
      if (problem) err(`reasons.${key}`, problem);
    }
  }
  const users: { file: string; base: string; item: unknown }[] = [
    ...events.map((e) => ({ file: e.file, base: `events[${e.index}]`, item: e.item as unknown })),
    ...actions.map((a) => ({ file: a.file, base: `actions[${a.index}]`, item: a.item as unknown })),
  ];
  for (const { file, base, item } of users) {
    walkKeys(item, base, MIND_KEYS, (_v, path) => {
      if (mind.length === 0) errors.push({ file, path, message: 'a key of happiness needs the top-level key "mind"' });
    });
  }
  // Deeds of the options: from the closed list, so a misspelt deed never silently costs nothing.
  for (const { file, index, item } of events) {
    const scenes = [{ at: `events[${index}]`, scene: item }, ...Object.entries(item.pages ?? {}).map(([id, page]) => ({ at: `events[${index}].pages.${id}`, scene: page }))];
    for (const { at, scene } of scenes) {
      scene.options?.forEach((option, i) => {
        option.acts?.forEach((act, j) => {
          const path = `${at}.options[${i}].acts[${j}]`;
          if (mind.length === 0) errors.push({ file, path, message: 'a deed needs the top-level key "mind"' });
          else if (!actIds.has(act)) errors.push({ file, path, message: `unknown deed "${act}"; deeds are listed in mind.acts` });
        });
      });
    }
  }
  return errors;
};
