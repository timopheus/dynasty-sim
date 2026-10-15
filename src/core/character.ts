import { ageYears } from './calendar';
import type { Effects } from './content/schema';

export interface Character {
  id: string;
  givenName: string;
  surname: string;
  birthDay: number;
  deathDay: number | null;
  /** 0..100. At 0 the character dies on the next day. */
  health: number;
  /** Integer; may go negative (debt). */
  money: number;
}

export function fullName(c: Character): string {
  return `${c.givenName} ${c.surname}`;
}

export function isAlive(c: Character): boolean {
  return c.deathDay === null;
}

export function applyEffects(c: Character, effects: Effects | undefined): void {
  if (!effects) return;
  if (effects.health !== undefined) c.health = Math.min(100, Math.max(0, c.health + effects.health));
  if (effects.money !== undefined) c.money += effects.money;
}

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

function healthMultiplier(health: number): number {
  if (health >= 70) return 1;
  if (health >= 40) return 2;
  if (health >= 20) return 4;
  return 8;
}

export const DAILY_DEATH_DENOMINATOR = 100000 * 365;

/** Numerator of the daily death chance out of DAILY_DEATH_DENOMINATOR; health 0 is certain death. */
export function dailyDeathChance(c: Character, day: number): number {
  if (c.health <= 0) return DAILY_DEATH_DENOMINATOR;
  const age = ageYears(c.birthDay, day);
  let annual = 0;
  for (const [maxAge, per100k] of ANNUAL_DEATHS_PER_100K) {
    if (age < maxAge) {
      annual = per100k;
      break;
    }
  }
  return annual * healthMultiplier(c.health);
}

/** Fills {name} and {age} placeholders for the given character on the given day. */
export function renderText(template: string, c: Character, day: number): string {
  return template
    .replaceAll('{name}', fullName(c))
    .replaceAll('{age}', String(ageYears(c.birthDay, day)));
}
