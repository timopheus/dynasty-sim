import { z } from 'zod';
import type { Unmet } from '../condition-keys';
import { Int } from '../content/types';
import type { Character, Ctx, Scope } from '../state';
import { timeContent } from '../time/seasons';
import { ageYears } from '../time/calendar';
import { fillReason } from './reasons';

/** Condition keys of this module (D-054): the character's money and age in full years. */
export const commonConditionShape = {
  money_min: Int.optional(),
  /** At most this much money: "at the bottom" of the narrator (D-165) and events for the poor. */
  money_max: Int.optional(),
  age_min: Int.min(0).optional(),
  age_max: Int.min(0).optional(),
};

interface CommonWhen {
  money_min?: number | undefined;
  money_max?: number | undefined;
  age_min?: number | undefined;
  age_max?: number | undefined;
}

export function checkCommonConditions({ state, content }: Ctx, c: Character, when: CommonWhen, _scope: Scope): Unmet[] {
  const { reasons } = timeContent(content);
  const texts: string[] = [];
  if (when.money_min !== undefined && c.money < when.money_min) texts.push(fillReason(reasons.money_min, { amount: String(when.money_min) }));
  if (when.money_max !== undefined && c.money > when.money_max) texts.push(fillReason(reasons.money_max, { amount: String(when.money_max) }));
  const age = ageYears(c.birthDay, state.day);
  if (when.age_min !== undefined && age < when.age_min) texts.push(fillReason(reasons.age_min, { age: String(when.age_min) }));
  if (when.age_max !== undefined && age > when.age_max) texts.push(fillReason(reasons.age_max, { age: String(when.age_max) }));
  return texts.map((text) => ({ text, hidden: false }));
}
