import type { Content } from '../content/schema';
import { statModifiers } from '../modifiers';
import type { Character, Ctx } from '../state';
import { ageYears } from '../time/calendar';
import { STAT_IDS, type StatId, type Stats } from './stat-ids';
import { findTrait } from './holding';

/** Education bonus per level (D-032): +2, +4, +6, +8. */
const EDUCATION_STEP = 2;
/** From this age Prowess falls, one point per AGE_STEP years (GDD 8.1). */
const PROWESS_DECLINE_FROM = 40;
/** From this age every stat except Learning falls as well. */
const OLD_AGE_FROM = 60;
const AGE_STEP = 3;

/** Change of each stat from age alone. */
export function ageModifiers(age: number): Partial<Stats> {
  const out: Partial<Stats> = {};
  if (age > PROWESS_DECLINE_FROM) out.prowess = -Math.floor((age - PROWESS_DECLINE_FROM) / AGE_STEP);
  if (age > OLD_AGE_FROM) {
    const loss = -Math.floor((age - OLD_AGE_FROM) / AGE_STEP);
    for (const id of STAT_IDS) if (id !== 'learning') out[id] = (out[id] ?? 0) + loss;
  }
  return out;
}

/**
 * The stats a character has today: base, traits, education, age and the
 * modifiers other modules register (health stages, 2.9), never below 0.
 * Never consumes randomness.
 */
export function stats(ctx: Ctx, c: Character): Stats {
  const out: Stats = { ...c.baseStats };
  const add = (change: Partial<Record<StatId, number | undefined>>) => {
    for (const id of STAT_IDS) out[id] += change[id] ?? 0;
  };
  for (const traitId of c.traits) {
    const def = findTrait(ctx.content, traitId);
    if (!def) continue;
    if (def.stats) add(def.stats);
    if (def.education) out[def.education.stat] += EDUCATION_STEP * def.education.level;
  }
  add(ageModifiers(ageYears(c.birthDay, ctx.state.day)));
  for (const mods of statModifiers(ctx, c)) add(mods);
  for (const id of STAT_IDS) out[id] = Math.max(0, out[id]);
  return out;
}

/** The word for a stat value (GDD 8.1): poor ... brilliant, from the scale in content. */
export function statWord(content: Content, value: number): string {
  let word = content.names.statScale[0]?.word ?? '';
  for (const step of content.names.statScale) if (step.from <= value) word = step.word;
  return word;
}

/** The word for the fame step of a character (D-037). */
export function fameWord(content: Content, c: Character): string {
  return content.names.fame[c.fame] ?? '';
}
