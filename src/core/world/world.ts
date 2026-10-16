import { findCharacter, getPlayer } from '../helpers';
import type { Character, CreateHook, DeathHook, GameState, Invariant } from '../state';

/**
 * World part of the game state (2.5, D-056, D-110). Until the map exists "near the hero" is the
 * hero's circle: 30–50 living people simulated day by day. Every other living person is "far":
 * they are touched once a year, on 1 January.
 */
export interface WorldState {
  /** Ids of the people of the circle in the order they joined; never the hero, never the dead. */
  circle: string[];
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
  return { circle: [], lastTickYear: null, lastMoveEndDay: null };
}

/** A character by id: the indexed lookup of `findCharacter` (D-194). */
export function characterById(state: GameState, id: string): Character | null {
  return findCharacter(state, id);
}

/**
 * Characters simulated day by day: the hero first, then the circle in the order they joined.
 * Health, death and relations phases go through this list. Returns a new array.
 */
export function detailedCharacters(state: GameState): Character[] {
  const list: Character[] = [characterById(state, state.playerId) ?? getPlayer(state)];
  for (const id of state.circle) {
    const c = characterById(state, id);
    if (c) list.push(c);
  }
  return list;
}

export const createWorld: CreateHook = (_ctx, c) => {
  c.occupation = null;
};

/** The dead leave the circle at once, so nobody dead is ever simulated in detail. */
export const worldOnDeath: DeathHook = ({ state }, c) => {
  state.circle = state.circle.filter((id) => id !== c.id);
};

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
    if (c.deathDay === null && c.id !== state.playerId && c.occupation === null) problems.push(`${c.id} lives without an occupation`);
  }
  return problems;
};
