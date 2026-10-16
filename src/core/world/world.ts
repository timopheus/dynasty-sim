import { findCharacter, getPlayer } from '../helpers';
import type { Character, CreateHook, DeathHook, GameState, Invariant, RefsFn } from '../state';
import { ageYears } from '../time/calendar';

/**
 * World part of the game state (2.5, D-056, D-110). Until the map exists "near the hero" is the
 * hero's circle: 30–50 living people simulated day by day. Every other living person is "far":
 * they are touched once a year, on 1 January.
 */
export interface WorldState {
  /** Ids of the people of the circle in the order they joined; never the hero, never the dead. */
  circle: string[];
  /**
   * The hero's household (D-313): the spouse and children under `adultAge`; for a hero under `adultAge`, a living
   * parent and brothers and sisters under age. Near the hero like the circle (D-056), but kept apart from it: they
   * do not move away with the circle. Never the hero, never the dead, never in the circle. 4.5 fills it.
   */
  household: string[];
  /** Year of the last yearly tick of people far away; null before the first world phase (D-111). */
  lastTickYear: number | null;
  /** End day of the last action whose move was applied, so a move happens once (D-110). */
  lastMoveEndDay: number | null;
}

/** World part of a character. */
export interface WorldCharacter {
  /** Id of an occupation from `population.occupations`; null for the heads of the house. */
  occupation: string | null;
}

export function initWorldState(): WorldState {
  return { circle: [], household: [], lastTickYear: null, lastMoveEndDay: null };
}

/** A character by id: the indexed lookup of `findCharacter` (D-194). */
export function characterById(state: GameState, id: string): Character | null {
  return findCharacter(state, id);
}

/** The hero, the household or the circle: people near the hero, whose opinions and lines are kept (D-056, D-063). */
export function isNear(state: GameState, id: string): boolean {
  return id === state.playerId || state.circle.includes(id) || state.household.includes(id);
}

/**
 * Characters simulated day by day: the hero first, then the household, then the circle in the order they joined.
 * Health, death and relations phases go through this list. Returns a new array.
 */
export function detailedCharacters(state: GameState): Character[] {
  const list: Character[] = [characterById(state, state.playerId) ?? getPlayer(state)];
  for (const ids of [state.household, state.circle]) {
    for (const id of ids) {
      const c = characterById(state, id);
      if (c) list.push(c);
    }
  }
  return list;
}

export const createWorld: CreateHook = (_ctx, c) => {
  c.occupation = null;
};

/** The dead leave the circle at once, so nobody dead is ever simulated in detail. */
export const worldOnDeath: DeathHook = ({ state }, c) => {
  state.circle = state.circle.filter((id) => id !== c.id);
  state.household = state.household.filter((id) => id !== c.id);
};

/** People the world part refers to (D-312): the hero, the household and the circle. */
export const worldRefs: RefsFn = ({ state }) => [state.playerId, ...state.household, ...state.circle];

export const worldInvariants: Invariant = ({ state, content }) => {
  const problems: string[] = [];
  const population = content.population;
  const seen = new Set<string>();
  for (const id of state.circle) {
    if (seen.has(id)) problems.push(`circle holds ${id} twice`);
    seen.add(id);
    const c = characterById(state, id);
    if (!c) problems.push(`circle holds unknown character ${id}`);
    else if (c.deathDay !== null) problems.push(`circle holds dead character ${id}`);
    else if (id === state.playerId) problems.push(`circle holds the hero ${id}`);
  }
  const inHousehold = new Set<string>();
  for (const id of state.household) {
    if (inHousehold.has(id)) problems.push(`household holds ${id} twice`);
    inHousehold.add(id);
    const c = characterById(state, id);
    if (!c) problems.push(`household holds unknown character ${id}`);
    else if (c.deathDay !== null) problems.push(`household holds dead character ${id}`);
    else if (id === state.playerId) problems.push(`household holds the hero ${id}`);
    if (seen.has(id)) problems.push(`${id} is both in the household and in the circle`);
  }
  if (!population) {
    if (state.circle.length > 0) problems.push('circle is not empty although the content has no population');
    return problems;
  }
  if (state.circle.length > population.circle.max) {
    problems.push(`circle has ${state.circle.length} people, more than ${population.circle.max}`);
  }
  const known = new Set(population.occupations.map((o) => o.id));
  for (const c of state.characters) {
    if (c.occupation !== null && !known.has(c.occupation)) problems.push(`${c.id} has unknown occupation ${String(c.occupation)}`);
    // Children and the household need no occupation (D-313).
    if (c.deathDay === null && c.id !== state.playerId && c.occupation === null && !inHousehold.has(c.id) && ageYears(c.birthDay, state.day) >= content.settings.adultAge) {
      problems.push(`${c.id} lives without an occupation`);
    }
  }
  return problems;
};
