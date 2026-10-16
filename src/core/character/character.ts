import { birthDayRange } from '../time/calendar';
import { chancePer, int, pick } from '../rng';
import { isInt } from '../helpers';
import type { Character, CreateHook, DeathHook, Invariant } from '../state';
import type { Sex } from './content';
import { generateStatsAndTraits } from './generate';
import { STAT_IDS, type Stats } from './stat-ids';
import { checkTraitHolding } from './holding';

export interface CharacterBase {
  id: string;
  givenName: string;
  surname: string;
  sex: Sex;
  birthDay: number;
  deathDay: number | null;
  /** Why the character died, an id such as "natural"; null while alive. */
  deathCause: string | null;
  /** Integer; may go negative (debt). */
  money: number;
  /** Stats before traits, education, age and conditions; the effective values come from stats.ts. */
  baseStats: Stats;
  /** Ids of held traits, in the order they were gained. */
  traits: string[];
  /** Fame step 0..3, from private person to known to all (D-037). */
  fame: number;
}

export function fullName(c: CharacterBase): string {
  return `${c.givenName} ${c.surname}`;
}

export function isAlive(c: CharacterBase): boolean {
  return c.deathDay === null;
}

/**
 * Sex, name, birth day, stats and traits. Runs first: the founder's random
 * sequence starts here. Sex is 50/50 and stats and traits are random: a stub
 * until the backstory of the first hero (D-038, D-055) and upbringing (D-018).
 */
export const createCharacterBase: CreateHook = (ctx, c, spec) => {
  const { state, content } = ctx;
  c.sex = chancePer(state.rng, 1, 2) ? 'male' : 'female';
  const births = birthDayRange(state.day, spec.age.min, spec.age.max);
  c.givenName = pick(state.rng, content.names.given[c.sex]);
  c.surname = spec.surname;
  c.birthDay = int(state.rng, births.earliest, births.latest);
  c.money = 0;
  c.fame = 0;
  generateStatsAndTraits(ctx, c);
};

export const characterOnDeath: DeathHook = () => {};

export const characterInvariants: Invariant = (ctx) => {
  const { state } = ctx;
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const c of state.characters) {
    if (ids.has(c.id)) problems.push(`duplicate character id ${c.id}`);
    ids.add(c.id);
    if (c.sex !== 'male' && c.sex !== 'female') problems.push(`${c.id} has unknown sex ${String(c.sex)}`);
    if (!isInt(c.fame) || c.fame < 0 || c.fame > 3) problems.push(`${c.id} fame out of range: ${c.fame}`);
    for (const stat of STAT_IDS) {
      if (!isInt(c.baseStats[stat])) problems.push(`${c.id} base ${stat} is not an integer: ${c.baseStats[stat]}`);
    }
    problems.push(...checkTraitHolding(ctx.content, c));
    if (!isInt(c.money)) problems.push(`${c.id} money is not an integer: ${c.money}`);
    if (!isInt(c.birthDay) || c.birthDay > state.day) problems.push(`${c.id} has invalid birth day ${c.birthDay}`);
    if (c.deathDay !== null && (!isInt(c.deathDay) || c.deathDay > state.day || c.deathDay < c.birthDay)) {
      problems.push(`${c.id} has invalid death day ${c.deathDay}`);
    }
    if ((c.deathDay === null) !== (c.deathCause === null)) problems.push(`${c.id} has a death day without a cause or back`);
  }
  const player = state.characters.find((c) => c.id === state.playerId);
  if (!player) problems.push(`player ${state.playerId} does not exist`);
  else if (!isAlive(player)) problems.push(`player ${state.playerId} is dead`);
  return problems;
};

export function addMoney(c: Character, amount: number): void {
  c.money += amount;
}
