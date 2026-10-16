import { z } from 'zod';
import { BASE_STAT_MAX, STAT_IDS, type StatId } from '../character/stat-ids';
import { Int } from '../content/types';
import { int } from '../rng';
import type { Character, Ctx, Scope } from '../state';
import { fromYmd, isLeapYear, toYmd } from '../time/calendar';

const Roll = z.strictObject({ min: Int, max: Int }).refine((r) => r.min <= r.max, { message: 'min is above max' });

/**
 * Effect keys of this module (3.11), scenes of `deck: backstory` only (checkBackstory):
 * - `age_years: n` — the character is n years older (university, early service); the date of birth moves back;
 * - `stats_roll: {stat: {min, max}}` — the base of the stat changes by a whole number drawn from the range: the
 *   answer sets the direction, the chance the size (D-167). Kept within 0..BASE_STAT_MAX like `stats`.
 */
export const backstoryEffectShape = {
  age_years: Int.min(1).max(5).optional(),
  stats_roll: z
    .strictObject(Object.fromEntries(STAT_IDS.map((id) => [id, Roll.optional()])) as Record<StatId, z.ZodOptional<typeof Roll>>)
    .refine((s) => Object.values(s).some((r) => r !== undefined), { message: 'name at least one stat' })
    .optional(),
};

/** The same day of the calendar `years` later (earlier when negative); 29 February falls back to the 28th. */
export function shiftYears(day: number, years: number): number {
  const b = toYmd(day);
  const year = b.year + years;
  return fromYmd(year, b.month, b.month === 2 && b.day === 29 && !isLeapYear(year) ? 28 : b.day);
}

export function applyBackstoryEffects(
  ctx: Ctx,
  c: Character,
  effects: { age_years?: number | undefined; stats_roll?: Partial<Record<StatId, { min: number; max: number } | undefined>> | undefined },
  _scope: Scope,
): void {
  if (effects.age_years !== undefined) c.birthDay = shiftYears(c.birthDay, -effects.age_years);
  for (const id of STAT_IDS) {
    const range = effects.stats_roll?.[id];
    if (range) c.baseStats[id] = Math.min(BASE_STAT_MAX, Math.max(0, c.baseStats[id] + int(ctx.state.rng, range.min, range.max)));
  }
}
