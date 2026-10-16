import { z } from 'zod';
import { checkReason } from '../conditions/reasons';
import { walkKeys } from '../conditions/walk';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';
import { PLACEHOLDERS } from '../character/text';

/**
 * Optional top-level key `house` (4.7, D-237, D-316). Every list is an array and is walked in file order (D-161):
 * - `statuses`: from the lowest; the first is the status of a new house;
 * - `renown.words`: the word for renown, the last entry whose `from` is <= the number (rising, the first is the floor);
 * - `renown.fame`: shift of renown when a head dies, by their fame step 0..3 (D-316);
 * - `renown.traits`: shift for each reputation trait the dead head held;
 * - `nicknames`: reputation trait -> nickname, in the order they win (the first held trait gives it);
 * - `texts.status`: chronicle line when the status of the house changes (`{house}`, `{status}` and the placeholders of a person);
 * - `reasons`: texts of the unmet conditions `house_status_min` (`{status}`) and `house_renown_min` (`{renown}`).
 */
export const HouseContentSchema = z.strictObject({
  statuses: z.array(z.strictObject({ id: Id, name: Text })).min(1),
  renown: z.strictObject({
    words: z.array(z.strictObject({ from: Int, word: Text })).min(1),
    fame: z.array(Int).length(4),
    traits: z.array(z.strictObject({ trait: Id, value: Int.refine((n) => n !== 0, { message: 'a shift of 0 does nothing' }) })),
  }),
  nicknames: z.array(z.strictObject({ trait: Id, nickname: Text })),
  texts: z.strictObject({ status: Text }),
  reasons: z.strictObject({ status_min: Text, renown_min: Text }),
});

export type HouseContent = z.infer<typeof HouseContentSchema>;

function unique(errors: ContentError[], file: string, path: string, ids: string[], what: string): void {
  const seen = new Set<string>();
  ids.forEach((id, i) => {
    if (seen.has(id)) errors.push({ file, path: `${path}[${i}]`, message: `duplicate ${what} "${id}"` });
    seen.add(id);
  });
}

export const checkHouse: CrossCheck = ({ house, traits, events, actions }) => {
  const errors: ContentError[] = [];
  const reputation = new Set(traits.filter((t) => t.item.category === 'reputation').map((t) => t.item.id));
  const hidden = new Set(traits.filter((t) => t.item.visibility !== 'obvious').map((t) => t.item.id));
  for (const { file, item } of house) {
    const err = (path: string, message: string) => errors.push({ file, path: `house.${path}`, message });
    unique(errors, file, 'house.statuses', item.statuses.map((s) => s.id), 'status id');
    item.renown.words.forEach((w, i) => {
      const prev = item.renown.words[i - 1];
      if (prev && w.from <= prev.from) err(`renown.words[${i}].from`, 'words must rise strictly');
    });
    unique(errors, file, 'house.renown.traits', item.renown.traits.map((t) => t.trait), 'trait');
    unique(errors, file, 'house.nicknames', item.nicknames.map((n) => n.trait), 'trait');
    item.nicknames.forEach((n, i) => {
      if (hidden.has(n.trait)) err(`nicknames[${i}].trait`, `trait "${n.trait}" is not obvious: a nickname would give it away`);
    });
    for (const [path, list] of [['renown.traits', item.renown.traits], ['nicknames', item.nicknames]] as const) {
      list.forEach((e, i) => {
        if (!reputation.has(e.trait)) err(`${path}[${i}].trait`, `unknown reputation trait "${e.trait}"`);
      });
    }
    const texts: [string, string, string[]][] = [
      ['texts.status', item.texts.status, [...PLACEHOLDERS, 'house', 'status']],
      ['reasons.status_min', item.reasons.status_min, ['status']],
      ['reasons.renown_min', item.reasons.renown_min, ['renown']],
    ];
    for (const [path, text, allowed] of texts) {
      const problem = checkReason(text, allowed);
      if (problem) err(path, problem);
    }
  }
  // The keys of events and actions that name a status, and the need for the content they run on.
  const known = new Set(house.flatMap((h) => h.item.statuses.map((s) => s.id)));
  const users: { file: string; base: string; item: unknown }[] = [
    ...events.map((e) => ({ file: e.file, base: `events[${e.index}]`, item: e.item })),
    ...actions.map((a) => ({ file: a.file, base: `actions[${a.index}]`, item: a.item })),
  ];
  for (const { file, base, item } of users) {
    const check = (id: unknown, path: string) => {
      if (house.length === 0) errors.push({ file, path, message: 'a house key needs the top-level key "house"' });
      else if (typeof id === 'string' && !known.has(id)) errors.push({ file, path, message: `unknown house status "${id}"` });
    };
    walkKeys(item, base, ['house_status'], (v, path) => check((v as { status?: unknown }).status, `${path}.status`));
    walkKeys(item, base, ['house_status_min'], check);
    walkKeys(item, base, ['house_renown'], (_v, path) => check(null, path));
    // the reason of an unmet threshold names a step, so the threshold is the start of one
    walkKeys(item, base, ['house_renown_min'], (v, path) => {
      check(null, path);
      const starts = house.flatMap((h) => h.item.renown.words.map((w) => w.from));
      if (house.length > 0 && !starts.includes(v as number)) errors.push({ file, path, message: `house_renown_min ${String(v)} must be the start (from) of a renown word: ${starts.join(', ')}` });
    });
  }
  return errors;
};
