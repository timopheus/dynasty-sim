import { ageYears } from '../time/calendar';
import type { Character, Ctx } from '../state';

/**
 * Annual deaths per 100,000 by age band, roughly early-modern adult mortality.
 * Integer table on purpose: no floating-point math in random rolls (D-003).
 */
const ANNUAL_DEATHS_PER_100K: readonly (readonly [number, number])[] = [
  [15, 800],
  [30, 1000],
  [40, 1400],
  [50, 2000],
  [60, 3500],
  [70, 6000],
  [80, 12000],
  [90, 22000],
  [Infinity, 40000],
];

export const ANNUAL_DEATH_DENOMINATOR = 100000;
export const DAILY_DEATH_DENOMINATOR = ANNUAL_DEATH_DENOMINATOR * 365;

/**
 * Chance to die within a year at this age, out of ANNUAL_DEATH_DENOMINATOR,
 * before any multipliers. Fixed signature (D-052): 2.9 may change the table,
 * 2.5 calls it for people far from the hero.
 */
export function annualDeathChance(age: number): number {
  for (const [maxAge, per100k] of ANNUAL_DEATHS_PER_100K) {
    if (age < maxAge) return per100k;
  }
  return 0;
}

function healthMultiplier(_ctx: Ctx, c: Character): number {
  if (c.health >= 70) return 1;
  if (c.health >= 40) return 2;
  if (c.health >= 20) return 4;
  return 8;
}

/** Integer multipliers of the death chance for a detailed character; 2.9 adds stages here. */
export const MORTALITY_MULTIPLIERS: readonly ((ctx: Ctx, c: Character) => number)[] = [healthMultiplier];

/** Numerator of the daily death chance out of DAILY_DEATH_DENOMINATOR; health 0 is certain death. */
export function dailyDeathChance(ctx: Ctx, c: Character): number {
  if (c.health <= 0) return DAILY_DEATH_DENOMINATOR;
  let chance = annualDeathChance(ageYears(c.birthDay, ctx.state.day));
  for (const multiplier of MORTALITY_MULTIPLIERS) chance *= multiplier(ctx, c);
  return chance;
}

/** Cause of death id for a death roll that came up. */
export function deathCause(c: Character): string {
  return c.health <= 0 ? 'ill_health' : 'natural';
}
