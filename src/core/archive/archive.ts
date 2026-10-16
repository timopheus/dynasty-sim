import type { ChronicleEntry } from '../chronicle/log';
import type { Content } from '../content/schema';
import { findCharacter } from '../helpers';
import type { Character, GameState } from '../state';
import { chunkProblems } from './check';

/**
 * Reading the whole history: the archive chunks and the hot part together (D-312). Only pages, markdown, metrics, the
 * summary of the house and the save read through here; rules of the simulation (phases, effects, conditions, roles,
 * the narrator) must not import this file — tests/architecture.test.ts checks it. Pure queries, no randomness.
 * While the archive is empty these return the hot data itself.
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

/**
 * Problems of the archive as a whole, for a loaded save (D-312): every chunk on its own (chunkProblems), chunks in the
 * order of their days, no id twice across the archive and the hot part, the hot chronicle after the archived one.
 * The hot part has its own invariants (invariants.ts).
 */
export function archiveProblems(state: GameState, content: Content): string[] {
  const problems: string[] = [];
  const ids = new Set(state.characters.map((c) => c.id));
  for (const chunk of state.archive) {
    for (const c of chunk.characters) {
      if (ids.has(c.id)) problems.push(`archive holds ${c.id} twice or also in the hot part`);
      ids.add(c.id);
    }
  }
  let prevDay = -Infinity;
  let lastEntry = -Infinity;
  state.archive.forEach((chunk, i) => {
    if (chunk.day <= prevDay || chunk.day > state.day) problems.push(`archive chunk ${i} is out of order`);
    prevDay = chunk.day;
    const last = chunk.chronicle.at(-1);
    if (chunk.chronicle.length > 0 && (chunk.chronicle[0] as ChronicleEntry).day < lastEntry) problems.push(`archive chunk ${i}: chronicle goes back in time`);
    if (last) lastEntry = last.day;
    problems.push(...chunkProblems(chunk, i, content, (id) => ids.has(id)));
  });
  const firstHot = state.chronicle[0];
  if (firstHot && firstHot.day < lastEntry) problems.push('the hot chronicle starts before the archived one ends');
  return problems;
}
