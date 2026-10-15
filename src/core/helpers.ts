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

export function findCharacter(state: GameState, id: string): Character | null {
  return state.characters.find((c) => c.id === id) ?? null;
}

export function getPlayer(state: GameState): Character {
  const player = findCharacter(state, state.playerId);
  if (!player) throw new Error(`Player character ${state.playerId} not found`);
  return player;
}
