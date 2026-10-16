import type { Content } from '../core/content/schema';
import { readSave, serialize, type SaveFailure } from '../core/save/save';
import type { GameState } from '../core/state';

/** The part of `Storage` the game uses; tests pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The one autosave slot (D-016). */
export const SAVE_KEY = 'dynasty-sim:save';

export type LoadOutcome =
  | { kind: 'none' }
  | { kind: 'loaded'; state: GameState }
  /** A save exists but cannot be used: the game says so and starts anew (D-058). */
  | { kind: 'discarded'; reason: SaveFailure | 'unreadable'; message: string };

export type SaveOutcome = { ok: true } | { ok: false; reason: 'quota' | 'unavailable'; message: string };

export function loadGame(store: KeyValueStore | null, content: Content): LoadOutcome {
  if (!store) return { kind: 'none' };
  let json: string | null;
  try {
    json = store.getItem(SAVE_KEY);
  } catch {
    return { kind: 'discarded', reason: 'unreadable', message: 'Browser storage cannot be read' };
  }
  if (json === null) return { kind: 'none' };
  const result = readSave(json, content);
  return result.ok ? { kind: 'loaded', state: result.state } : { kind: 'discarded', reason: result.reason, message: result.message };
}

function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014;
}

/** Writes the autosave. Never throws: a failed write leaves the previous save in place. */
export function saveGame(store: KeyValueStore | null, state: GameState): SaveOutcome {
  if (!store) return { ok: false, reason: 'unavailable', message: 'Browser storage is not available' };
  let json: string;
  try {
    json = serialize(state);
  } catch (error) {
    return { ok: false, reason: 'unavailable', message: error instanceof Error ? error.message : String(error) };
  }
  try {
    store.setItem(SAVE_KEY, json);
    return { ok: true };
  } catch (error) {
    return isQuotaError(error)
      ? { ok: false, reason: 'quota', message: 'Browser storage is full' }
      : { ok: false, reason: 'unavailable', message: 'Browser storage refused the save' };
  }
}

export function clearGame(store: KeyValueStore | null): void {
  try {
    store?.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/** The seed asked for in the address (`?seed=N`), or null when there is none or it is not valid. */
export function seedFromSearch(search: string, isValid: (n: number) => boolean): number | null {
  const param = new URLSearchParams(search).get('seed');
  if (param === null || param.trim() === '') return null;
  const seed = Number(param);
  return isValid(seed) ? seed : null;
}

/**
 * What to do at start: continue the saved game, or begin a new one. A saved game is kept unless
 * the address asks for another seed.
 */
export function startChoice(outcome: LoadOutcome, requestedSeed: number | null): 'continue' | 'ask_replace' | 'new' {
  if (outcome.kind !== 'loaded') return 'new';
  return requestedSeed === null || requestedSeed === outcome.state.seed ? 'continue' : 'ask_replace';
}
