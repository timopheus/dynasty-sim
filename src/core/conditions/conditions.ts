import { z } from 'zod';
import { Int } from '../content/types';
import type { Character, Ctx } from '../state';
import { timeContent } from '../time/seasons';
import { ageYears } from '../time/calendar';
import { fillReason } from './reasons';

/** Condition keys of this module (D-054): the hero's money and age in full years. */
export const commonConditionShape = {
  money_min: Int.optional(),
  age_min: Int.min(0).optional(),
  age_max: Int.min(0).optional(),
};

interface CommonWhen {
  money_min?: number | undefined;
  age_min?: number | undefined;
  age_max?: number | undefined;
}

export function checkCommonConditions({ state, content }: Ctx, c: Character, when: CommonWhen): string[] {
  const { reasons } = timeContent(content);
  const reasonsOut: string[] = [];
  if (when.money_min !== undefined && c.money < when.money_min) {
    reasonsOut.push(fillReason(reasons.money_min, { amount: String(when.money_min) }));
  }
  const age = ageYears(c.birthDay, state.day);
  if (when.age_min !== undefined && age < when.age_min) reasonsOut.push(fillReason(reasons.age_min, { age: String(when.age_min) }));
  if (when.age_max !== undefined && age > when.age_max) reasonsOut.push(fillReason(reasons.age_max, { age: String(when.age_max) }));
  return reasonsOut;
}
