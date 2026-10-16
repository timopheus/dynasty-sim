/**
 * Assembly file (D-052, D-054): condition keys of all modules. A module declares
 * its keys (zod shape) and a check that returns the reasons a condition is not
 * met, as content texts; this file only lists them. The conditions/ module (2.2)
 * decides where `when` is used and how unmet conditions are shown.
 *
 * Checks see the scope of roles (D-162): a key that names another person names
 * a role of the scope. A reason that would give away what the hero cannot know
 * (a secret trait, the opinion of a stranger) is hidden: the option is not shown.
 */
import { z } from 'zod';
import { characterConditionShape, checkCharacterConditions } from './character/conditions';
import { checkCommonConditions, commonConditionShape } from './conditions/conditions';
import { checkHealthConditions, healthConditionShape } from './health/health';
import { checkRelationsConditions, relationsConditionRoleRefs, relationsConditionShape } from './relations/conditions';
import { checkRolesConditions, rolesConditionShape } from './roles/conditions';
import type { Character, Ctx, Scope } from './state';
import { checkTimeConditions, timeConditionShape } from './time/time';

/** The `when` block of the content (D-040). */
export const WhenSchema = z.strictObject({
  ...timeConditionShape,
  ...commonConditionShape,
  ...characterConditionShape,
  ...healthConditionShape,
  ...relationsConditionShape,
  ...rolesConditionShape,
});

export type When = z.infer<typeof WhenSchema>;

/** A condition that is not met: its content text, and whether showing it would give away a secret. */
export interface Unmet {
  text: string;
  hidden: boolean;
}

/** Checks in a fixed order, so the reasons come out in the same order every time. */
const CONDITION_CHECKS: readonly ((ctx: Ctx, c: Character, when: When, scope: Scope) => Unmet[])[] = [
  checkTimeConditions,
  checkCommonConditions,
  checkCharacterConditions,
  checkHealthConditions,
  checkRelationsConditions,
  checkRolesConditions,
];

/** Roles each module's keys refer to, for the cross-check of events. */
const CONDITION_ROLE_REFS: readonly ((when: When) => string[])[] = [relationsConditionRoleRefs];

export interface ConditionReport {
  met: boolean;
  /** Texts of the visible unmet conditions (D-043). */
  reasons: string[];
  /** Some unmet condition is hidden: the option is not shown at all. */
  hidden: boolean;
}

/** Every unmet condition for the character in the scope of roles. Never consumes randomness. */
export function conditionReport(ctx: Ctx, c: Character, when: When, scope: Scope): ConditionReport {
  const unmet = CONDITION_CHECKS.flatMap((check) => check(ctx, c, when, scope));
  return {
    met: unmet.length === 0,
    reasons: unmet.filter((u) => !u.hidden).map((u) => u.text),
    hidden: unmet.some((u) => u.hidden),
  };
}

/** Texts of the visible unmet conditions; empty means met unless a hidden one is unmet (see conditionReport). */
export function unmetConditions(ctx: Ctx, c: Character, when: When, scope: Scope): string[] {
  return conditionReport(ctx, c, when, scope).reasons;
}

/** Role names the conditions refer to; the built-in roles `hero` and `protagonist` included. */
export function conditionRoleRefs(when: When): string[] {
  return CONDITION_ROLE_REFS.flatMap((refs) => refs(when));
}
