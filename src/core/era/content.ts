import { z } from 'zod';
import { checkReason } from '../conditions/reasons';
import { walkKeys } from '../conditions/walk';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';
import { START_YEAR } from '../time/calendar';

const EraSchema = z.strictObject({
  id: Id,
  name: Text,
  /** First and last calendar year of the era; the last era may omit `to`. */
  from: Int,
  to: Int.optional(),
});

/**
 * Optional top-level key `eras` (4.11, D-239, D-385):
 * - `list`: the eras in order, without gaps (each starts the year after the previous one ends); the first starts in the
 *   first year of the game; the last one goes on after its `to` (or without it);
 * - `reasons`: texts of the unmet conditions `years` (`{year}`: `min` / `max`) and `era` (`{eras}`, names).
 */
export const ErasContentSchema = z.strictObject({
  list: z.array(EraSchema).min(1),
  reasons: z.strictObject({ years_min: Text, years_max: Text, era: Text }),
});

export type ErasContent = z.infer<typeof ErasContentSchema>;

const REASON_VARS = { years_min: ['year'], years_max: ['year'], era: ['eras'] } as const;

export const checkEras: CrossCheck = ({ eras, events, actions }) => {
  const errors: ContentError[] = [];
  for (const { file, item } of eras) {
    const err = (path: string, message: string) => errors.push({ file, path: `eras.${path}`, message });
    const ids = new Set<string>();
    item.list.forEach((era, i) => {
      if (ids.has(era.id)) err(`list[${i}].id`, `duplicate era id "${era.id}"`);
      ids.add(era.id);
      const last = i === item.list.length - 1;
      if (era.to === undefined && !last) err(`list[${i}].to`, `only the last era may have no "to"`);
      if (era.to !== undefined && era.to < era.from) err(`list[${i}].to`, `era "${era.id}" ends before it starts`);
      const prev = item.list[i - 1];
      if (i === 0 && era.from !== START_YEAR) err('list[0].from', `the first era starts in ${START_YEAR}, the first year of the game`);
      if (prev?.to !== undefined && era.from !== prev.to + 1) {
        err(`list[${i}].from`, era.from <= prev.to ? `era "${era.id}" overlaps "${prev.id}"` : `gap between eras "${prev.id}" and "${era.id}": it should start in ${prev.to + 1}`);
      }
    });
    for (const key of Object.keys(REASON_VARS) as (keyof typeof REASON_VARS)[]) {
      const problem = checkReason(item.reasons[key], REASON_VARS[key]);
      if (problem) err(`reasons.${key}`, problem);
    }
  }
  const known = new Set(eras.flatMap((e) => e.item.list.map((era) => era.id)));
  const users = [
    ...events.map((e) => ({ file: e.file, base: `events[${e.index}]`, item: e.item })),
    ...actions.map((a) => ({ file: a.file, base: `actions[${a.index}]`, item: a.item })),
  ];
  for (const { file, base, item } of users) {
    walkKeys(item, base, ['era'], (ids, path) => {
      if (!Array.isArray(ids)) return;
      ids.forEach((id, i) => {
        if (typeof id === 'string' && !known.has(id)) errors.push({ file, path: `${path}[${i}]`, message: `unknown era "${id}"` });
      });
    });
  }
  return errors;
};
