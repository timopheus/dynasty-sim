/** Small helpers every module may use. No module imports runtime code from state.ts. */
import type { Character, GameState } from './state';

export function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n);
}

/** A new permanent id like "c12" (D-020). The counter is shared by all prefixes. */
export function newId(state: GameState, prefix: string): string {
  const id = `${prefix}${state.nextId}`;
  state.nextId += 1;
  return id;
}

type CharacterIndex = { byId: Map<string, number>; count: number };

/**
 * Positions of characters by id, one index per `state.characters` array (D-194). A cache, not part of the
 * state, never saved. Characters are only appended (entities are not removed), so the index catches up with
 * new ones; a loaded save brings a new array and gets its own index. Ids are unique (an invariant of `character/`).
 */
const indexes = new WeakMap<Character[], CharacterIndex>();

function freshIndex(list: Character[]): CharacterIndex {
  const index = { byId: new Map<string, number>(), count: 0 };
  indexes.set(list, index);
  return index;
}

export function findCharacter(state: GameState, id: string): Character | null {
  const list = state.characters;
  let index = indexes.get(list) ?? freshIndex(list);
  if (index.count > list.length) index = freshIndex(list);
  for (; index.count < list.length; index.count++) index.byId.set((list[index.count] as Character).id, index.count);
  const at = index.byId.get(id);
  const hit = at === undefined ? undefined : list[at];
  if (hit?.id === id) return hit;
  // Not indexed, or the array was changed in place other than by appending: a plain scan, as before.
  const found = list.find((c) => c.id === id) ?? null;
  if (found) freshIndex(list);
  return found;
}

export function getPlayer(state: GameState): Character {
  const player = findCharacter(state, state.playerId);
  if (!player) throw new Error(`Player character ${state.playerId} not found`);
  return player;
}
