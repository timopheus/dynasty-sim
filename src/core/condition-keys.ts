/**
 * Assembly file (D-052, D-054): condition keys of all modules. A module declares
 * its keys (zod shape) and a check that returns the reasons a condition is not
 * met, as content texts; this file only lists them. The conditions/ module (2.2)
 * decides where `when` is used and how unmet conditions are shown.
 */
import { z } from 'zod';
import { characterConditionShape, checkCharacterConditions } from './character/conditions';
import { checkCommonConditions, commonConditionShape } from './conditions/conditions';
import { checkHealthConditions, healthConditionShape } from './health/health';
import type { Character, Ctx } from './state';
import { checkTimeConditions, timeConditionShape } from './time/time';

/** The `when` block of the content (D-040). */
export const WhenSchema = z.strictObject({
  ...timeConditionShape,
  ...commonConditionShape,
  ...characterConditionShape,
  ...healthConditionShape,
});

export type When = z.infer<typeof WhenSchema>;

/** Checks in a fixed order, so the reasons come out in the same order every time. */
const CONDITION_CHECKS: readonly ((ctx: Ctx, c: Character, when: When) => string[])[] = [
  checkTimeConditions,
  checkCommonConditions,
  checkCharacterConditions,
  checkHealthConditions,
];

/** Reasons the conditions are not met for the character; empty means met. Never consumes randomness. */
export function unmetConditions(ctx: Ctx, c: Character, when: When): string[] {
  return CONDITION_CHECKS.flatMap((check) => check(ctx, c, when));
}
