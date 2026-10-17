import { scaleByTraits } from '../character/holding';
import { ageYears } from '../time/calendar';
import type { Content } from '../content/schema';
import type { Character, Ctx } from '../state';
import { conditionMortality } from './course';

/**
 * Annual deaths per 100,000 by age for people far from the hero (2.5), whose
 * conditions are not simulated: all causes together. Calibrated on headless runs
 * so that they live about as long as the people simulated day by day (D-101).
 * Integer table on purpose: no floating-point math in random rolls (D-003).
 */
const ANNUAL_DEATHS_PER_100K: readonly (readonly [number, number])[] = [
  [15, 800], // children are not simulated before the Dynasty stage; kept from the old table
  [30, 1800],
  [40, 1850],
  [50, 1950],
  [60, 2700],
  [70, 5600],
  [80, 15000],
  [90, 30000],
  [Infinity, 40000],
];

export const ANNUAL_DEATH_DENOMINATOR = 100000;
export const DAILY_DEATH_DENOMINATOR = ANNUAL_DEATH_DENOMINATOR * 365;

/**
 * Chance to die within a year at this age, out of ANNUAL_DEATH_DENOMINATOR, for
 * people far from the hero. Fixed signature (D-052): 2.5 calls it.
 */
export function annualDeathChance(age: number): number {
  for (const [maxAge, per100k] of ANNUAL_DEATHS_PER_100K) {
    if (age < maxAge) return per100k;
  }
  return 0;
}

/** The row of the content mortality table for an age: deaths of the simulated not caused by a condition. */
export function mortalityRow(content: Content, age: number): { per100k: number; cause: string } {
  const rows = content.health.mortality;
  const row = rows.find((r) => r.below === undefined || age < r.below) ?? rows[rows.length - 1];
  if (!row) throw new Error('The mortality table is empty');
  return row;
}

/**
 * Numerator of the daily death chance out of DAILY_DEATH_DENOMINATOR: the table row times the stage multipliers and
 * the death percent of the traits (D-329). People far from the hero (`annualDeathChance`) have no traits at hand.
 */
export function dailyDeathChance(ctx: Ctx, c: Character): number {
  const row = mortalityRow(ctx.content, ageYears(c.birthDay, ctx.state.day));
  const base = row.per100k * conditionMortality(ctx.content, c).multiplier;
  return Math.min(DAILY_DEATH_DENOMINATOR, scaleByTraits(ctx.content, base, [c], 'mortalityPct'));
}

/** Cause of a death roll that came up: the condition most to blame, else the cause of the table row. */
export function deathCause(ctx: Ctx, c: Character): string {
  const { blame } = conditionMortality(ctx.content, c);
  return blame ? blame.cause : mortalityRow(ctx.content, ageYears(c.birthDay, ctx.state.day)).cause;
}
