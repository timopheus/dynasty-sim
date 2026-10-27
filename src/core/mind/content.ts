import { z } from 'zod';
import { checkReason } from '../conditions/reasons';
import { walkKeys } from '../conditions/walk';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';
import { checkTemplate } from '../text/text';

export const DEED_COSTS = ['small', 'medium', 'large'] as const;

/**
 * Optional top-level key `mind` (D-457, D-460, D-467; points of S.9a, filled by S.10):
 * - `happiness`: the range of the hero's happiness and the base a new head starts from and every month tends to;
 * - `words`: the word of each stretch of the range ("content", "unhappy"), ascending by `upTo`; the last reaches `max`;
 * - `moods`: the mood of the portrait by happiness when no event on screen sets one (an id of `narrator.moods`), ascending;
 * - `acts`: the closed list of kinds of deeds an option of an event may name in `acts:` (`docs/reference/against-nature.md`);
 * - `costs`: what a deed against the hero's nature costs, by size, and `favour`, what one true to it gives (D-467);
 * - `traits`: per trait of character, the deeds that go against it (with their size) and the deeds that are its own way;
 * - `pull`: each month happiness moves one part of `den` of the distance to the base, at least a point;
 * - `poverty`: each month the hero's money is at most `money_max`, happiness falls by `monthly`;
 * - `breakdown`: at `at_most` or lower the hero breaks: gains `trait`, a chronicle line `text`, happiness is set to `reset`;
 * - `reasons`: texts of the unmet conditions `happiness_min` and `happiness_max` (`{value}`).
 */
export const MindContentSchema = z.strictObject({
  happiness: z.strictObject({ min: Int, max: Int, base: Int }),
  words: z.array(z.strictObject({ upTo: Int, word: Text })).min(1),
  moods: z.array(z.strictObject({ upTo: Int, mood: Id })).min(1),
  acts: z.array(z.strictObject({ id: Id, name: Text })),
  costs: z.strictObject({ small: Int.min(1), medium: Int.min(1), large: Int.min(1), favour: Int.min(0) }),
  traits: z.array(z.strictObject({
    trait: Id,
    against: z.array(z.strictObject({ act: Id, cost: z.enum(DEED_COSTS) })).optional(),
    favours: z.array(Id).optional(),
  })),
  pull: z.strictObject({ den: Int.min(1) }),
  poverty: z.strictObject({ money_max: Int, monthly: Int.max(0) }),
  breakdown: z.strictObject({ at_most: Int, reset: Int, trait: Id, text: Text }),
  reasons: z.strictObject({ happiness_min: Text, happiness_max: Text }),
});

export type MindContent = z.infer<typeof MindContentSchema>;

/** Keys of effects and conditions of this module, which need the key `mind`. */
const MIND_KEYS = ['happiness', 'happiness_min', 'happiness_max'];

export const checkMind: CrossCheck = ({ mind, events, actions, traits, narrator }) => {
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
    const bands = (path: string, list: { upTo: number }[]) => {
      list.forEach((b, i) => {
        if (i > 0 && b.upTo <= (list[i - 1]?.upTo ?? 0)) err(`${path}[${i}].upTo`, 'bands must be in ascending order');
      });
      if ((list.at(-1)?.upTo ?? 0) < max) err(`${path}`, `the last band must reach ${max}`);
    };
    bands('words', item.words);
    bands('moods', item.moods);
    const moodIds = new Set(narrator.flatMap((n) => n.item.moods ?? []));
    item.moods.forEach((m, i) => {
      if (moodIds.size > 0 && !moodIds.has(m.mood)) err(`moods[${i}].mood`, `unknown mood "${m.mood}"`);
    });
    if (item.breakdown.at_most < min || item.breakdown.reset <= item.breakdown.at_most || item.breakdown.reset > max) err('breakdown', 'at_most must be within the range and below reset, reset within the range');
    const problem = checkTemplate(item.breakdown.text);
    if (problem) err('breakdown.text', problem);
    const traitIds = new Set(traits.map((t) => t.item.id));
    if (!traitIds.has(item.breakdown.trait)) err('breakdown.trait', `unknown trait "${item.breakdown.trait}"`);
    const ids = new Set(item.acts.map((a) => a.id));
    item.traits.forEach((t, i) => {
      if (!traitIds.has(t.trait)) err(`traits[${i}].trait`, `unknown trait "${t.trait}"`);
      for (const a of [...(t.against ?? []).map((x) => x.act), ...(t.favours ?? [])]) {
        if (!ids.has(a)) err(`traits[${i}]`, `unknown deed "${a}"`);
      }
      const against = new Set((t.against ?? []).map((x) => x.act));
      for (const a of t.favours ?? []) if (against.has(a)) err(`traits[${i}]`, `deed "${a}" is both against and by the nature of "${t.trait}"`);
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
