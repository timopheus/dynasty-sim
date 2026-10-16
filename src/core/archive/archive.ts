import type { ChronicleEntry } from '../chronicle/log';
import { findCharacter } from '../helpers';
import type { Character, GameState } from '../state';

/**
 * Reading the whole history: the archive chunks and the hot part together (D-312). Only pages, markdown, metrics, the
 * summary of the house and the save read through here; rules of the simulation (phases, effects, conditions, roles,
 * the narrator) must not import this file — tests/architecture.test.ts checks it. Pure queries, no randomness.
 * Until 4.3 makes chunks the archive is empty and these return the hot data itself.
 */

/** Every chronicle entry, archived ones first, oldest first. The hot array itself while the archive is empty: do not change it. */
export function allChronicle(state: GameState): readonly ChronicleEntry[] {
  if (state.archive.length === 0) return state.chronicle;
  return [...state.archive.flatMap((chunk) => chunk.chronicle), ...state.chronicle];
}

/** Every character, archived ones first. The hot array itself while the archive is empty: do not change it. */
export function allCharacters(state: GameState): readonly Character[] {
  if (state.archive.length === 0) return state.characters;
  return [...state.archive.flatMap((chunk) => chunk.characters), ...state.characters];
}

/** A character by id, hot or archived; null if there is no such person. */
export function anyCharacter(state: GameState, id: string): Character | null {
  const hot = findCharacter(state, id);
  if (hot) return hot;
  for (const chunk of state.archive) {
    const found = chunk.characters.find((c) => c.id === id);
    if (found) return found;
  }
  return null;
}
