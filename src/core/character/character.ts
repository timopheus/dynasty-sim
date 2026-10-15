import { birthDayRange } from '../time/calendar';
import { int, pick } from '../rng';
import { isInt } from '../helpers';
import type { Character, CreateHook, Invariant } from '../state';

export interface CharacterBase {
  id: string;
  givenName: string;
  surname: string;
  birthDay: number;
  deathDay: number | null;
  /** Why the character died, an id such as "natural"; null while alive. */
  deathCause: string | null;
  /** Integer; may go negative (debt). */
  money: number;
}

export function fullName(c: CharacterBase): string {
  return `${c.givenName} ${c.surname}`;
}

export function isAlive(c: CharacterBase): boolean {
  return c.deathDay === null;
}

/** Name and birth day. Runs first: the founder's random sequence starts here. */
export const createCharacterBase: CreateHook = ({ state, content }, c, spec) => {
  const births = birthDayRange(state.day, spec.age.min, spec.age.max);
  c.givenName = pick(state.rng, content.names.given);
  c.surname = spec.surname;
  c.birthDay = int(state.rng, births.earliest, births.latest);
  c.money = 0;
};

export const characterInvariants: Invariant = ({ state }) => {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const c of state.characters) {
    if (ids.has(c.id)) problems.push(`duplicate character id ${c.id}`);
    ids.add(c.id);
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
