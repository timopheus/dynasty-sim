import { stats } from '../character/stats';
import { conditionReport } from '../condition-keys';
import { findCharacter } from '../helpers';
import { chancePer } from '../rng';
import type { Character, Ctx, Scope } from '../state';
import type { CheckDef } from './content';

/** Checks of stats (D-042): 50% and 5% per point of difference, within 5–95%. Integers only (D-003). */
export const CHECK_BASE = 50;
export const CHECK_STEP = 5;
export const CHECK_MIN = 5;
export const CHECK_MAX = 95;

/**
 * Words of the chance the player sees before the choice (D-042), from hopeless to certain: the upper bound in percent
 * of each band. The words themselves are for the screen (3.10); here they are ids.
 */
export const CHANCE_BANDS = [
  { id: 'hopeless', upTo: 15 },
  { id: 'risky', upTo: 40 },
  { id: 'even', upTo: 60 },
  { id: 'likely', upTo: 85 },
  { id: 'certain', upTo: 100 },
] as const;

export type ChanceBand = (typeof CHANCE_BANDS)[number]['id'];

/** Who is checked: the main participant, or the role `of` (D-193). */
function checkedPerson(ctx: Ctx, check: CheckDef, protagonist: Character, scope: Scope): Character {
  if (check.of === undefined) return protagonist;
  const id = scope[check.of];
  const person = id === undefined ? null : findCharacter(ctx.state, id);
  if (!person) throw new Error(`Check: role "${check.of}" is not filled`);
  return person;
}

/** Stat in the check: today's stat of the person checked plus the bonuses whose conditions that person meets. */
export function checkStat(ctx: Ctx, check: CheckDef, protagonist: Character, scope: Scope): number {
  const person = checkedPerson(ctx, check, protagonist, scope);
  let value = stats(ctx, person)[check.stat];
  for (const b of check.bonus ?? []) if (conditionReport(ctx, person, b.when, scope).met) value += b.add;
  return value;
}

/** What the stat is measured against: the difficulty, or the stat of the role in an opposed check. */
export function checkTarget(ctx: Ctx, check: CheckDef, scope: Scope): number {
  if (check.against) {
    const id = scope[check.against.role];
    const opponent = id === undefined ? null : findCharacter(ctx.state, id);
    if (!opponent) throw new Error(`Opposed check: role "${check.against.role}" is not filled`);
    return stats(ctx, opponent)[check.against.stat];
  }
  return check.difficulty ?? 0;
}

/** Chance of success in percent, 5–95. Pure. */
export function checkChance(ctx: Ctx, check: CheckDef, protagonist: Character, scope: Scope): number {
  const chance = CHECK_BASE + CHECK_STEP * (checkStat(ctx, check, protagonist, scope) - checkTarget(ctx, check, scope));
  return Math.min(CHECK_MAX, Math.max(CHECK_MIN, chance));
}

export function chanceBand(percent: number): ChanceBand {
  return CHANCE_BANDS.find((b) => percent <= b.upTo)?.id ?? 'certain';
}

/** Rolls the check from the world's stream: true is success. */
export function rollCheck(ctx: Ctx, check: CheckDef, protagonist: Character, scope: Scope): boolean {
  return chancePer(ctx.state.rng, checkChance(ctx, check, protagonist, scope), 100);
}
