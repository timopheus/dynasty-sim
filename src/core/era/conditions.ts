import { z } from 'zod';
import type { Unmet } from '../condition-keys';
import { fillReason, joinOr } from '../conditions/reasons';
import { Id, Int } from '../content/types';
import type { Character, Ctx, Scope } from '../state';
import { toYmd } from '../time/calendar';
import { eraOf } from './era';

/**
 * Condition keys of this module (4.11, D-386): `years: {min, max}` (the calendar year of today) and `era: [ids]`
 * (today is in one of these eras). Neither names another person.
 */
export const eraConditionShape = {
  years: z
    .strictObject({ min: Int.optional(), max: Int.optional() })
    .refine((y) => y.min !== undefined || y.max !== undefined, 'needs min or max')
    .refine((y) => y.min === undefined || y.max === undefined || y.min <= y.max, 'min is above max')
    .optional(),
  era: z.array(Id).min(1).optional(),
};

interface EraWhen {
  years?: { min?: number | undefined; max?: number | undefined } | undefined;
  era?: string[] | undefined;
}

export function checkEraConditions(ctx: Ctx, _c: Character, when: EraWhen, _scope: Scope): Unmet[] {
  const texts: string[] = [];
  const reasons = ctx.content.eras?.reasons;
  const year = toYmd(ctx.state.day).year;
  if (when.years) {
    const { min, max } = when.years;
    if (min !== undefined && year < min) texts.push(fillReason(reasons?.years_min ?? 'Not before {year}', { year: String(min) }));
    if (max !== undefined && year > max) texts.push(fillReason(reasons?.years_max ?? 'Not after {year}', { year: String(max) }));
  }
  if (when.era) {
    const current = eraOf(ctx, ctx.state.day);
    if (!current || !when.era.includes(current.id)) {
      const names = when.era.map((id) => ctx.content.eras?.list.find((e) => e.id === id)?.name ?? id);
      texts.push(fillReason(reasons?.era ?? 'Only in {eras}', { eras: joinOr(names) }));
    }
  }
  return texts.map((text) => ({ text, hidden: false }));
}

/** Roles the keys of this module refer to: none. */
export function eraConditionRoleRefs(_when: object): string[] {
  return [];
}
