import { z } from 'zod';
import { checkReason } from '../conditions/reasons';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';
import { checkTemplate } from '../text/text';

const SeasonSchema = z.strictObject({
  id: Id,
  name: Text,
  /** Calendar months (1..12) that belong to the season. */
  months: z.array(Int.min(1).max(12)).min(1),
});

/** Texts of unmet conditions of `when` (D-043); `{seasons}`, `{amount}`, `{age}` are filled in. */
const ReasonsSchema = z.strictObject({
  season: Text,
  money_min: Text,
  money_max: Text,
  age_min: Text,
  age_max: Text,
});

/** Top-level content key `time`: seasons and the texts of the time and action rules. Required (see checkTime). */
export const TimeContentSchema = z.strictObject({
  seasons: z.array(SeasonSchema).min(1),
  reasons: ReasonsSchema,
  texts: z.strictObject({
    /** Journal line when an action is interrupted without a text of its own. */
    interrupted: Text,
  }),
});

export type TimeContent = z.infer<typeof TimeContentSchema>;
export type SeasonDef = z.infer<typeof SeasonSchema>;

export const REASON_VARS = {
  season: ['seasons'],
  money_min: ['amount'],
  money_max: ['amount'],
  age_min: ['age'],
  age_max: ['age'],
} as const;

export const checkTime: CrossCheck = ({ time }) => {
  const errors: ContentError[] = [];
  if (time.length === 0) {
    errors.push({ file: '(content)', path: 'time', message: 'the time section (seasons, reasons) is required' });
    return errors;
  }
  for (const { file, item } of time) {
    const ids = new Set<string>();
    const monthOwner: (string | undefined)[] = [];
    item.seasons.forEach((season, i) => {
      const at = `time.seasons[${i}]`;
      if (ids.has(season.id)) errors.push({ file, path: `${at}.id`, message: `duplicate season id "${season.id}"` });
      ids.add(season.id);
      season.months.forEach((month, j) => {
        const owner = monthOwner[month];
        if (owner !== undefined) {
          errors.push({ file, path: `${at}.months[${j}]`, message: `month ${month} already belongs to season "${owner}"` });
        }
        monthOwner[month] = season.id;
      });
    });
    for (let month = 1; month <= 12; month += 1) {
      if (monthOwner[month] === undefined) errors.push({ file, path: 'time.seasons', message: `month ${month} belongs to no season` });
    }
    for (const key of Object.keys(REASON_VARS) as (keyof typeof REASON_VARS)[]) {
      const problem = checkReason(item.reasons[key], REASON_VARS[key]);
      if (problem) errors.push({ file, path: `time.reasons.${key}`, message: problem });
    }
    const problem = checkTemplate(item.texts.interrupted);
    if (problem) errors.push({ file, path: 'time.texts.interrupted', message: problem });
  }
  return errors;
};
