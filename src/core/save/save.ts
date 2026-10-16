import type { Content } from '../content/schema';
import { checkInvariants } from '../invariants';
import type { GameState } from '../state';

import { SAVE_VERSION } from './version';

export { SAVE_VERSION };

/** Paths where the value is not plain JSON data: undefined, NaN or Infinity, functions, class instances, Map/Set. */
export function jsonProblems(value: unknown, path = 'state'): string[] {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [`${path} is ${value}`];
  if (Array.isArray(value)) return value.flatMap((v, i) => jsonProblems(v, `${path}[${i}]`));
  if (typeof value === 'object') {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return [`${path} is not a plain object`];
    return Object.entries(value).flatMap(([k, v]) => jsonProblems(v, `${path}.${k}`));
  }
  return [`${path} is ${typeof value}`];
}

export function serialize(state: GameState): string {
  const problems = jsonProblems(state);
  if (problems.length > 0) throw new Error(`State is not plain JSON: ${problems.slice(0, 5).join('; ')}`);
  return JSON.stringify(state);
}

export type SaveFailure = 'old_version' | 'corrupt';

export type SaveResult = { ok: true; state: GameState } | { ok: false; reason: SaveFailure; message: string };

/**
 * Reads a save without throwing. A save of another format version is refused before anything
 * else looks at it: it is not migrated, the caller starts a new game (D-058). Everything else
 * that does not load is `corrupt`.
 */
export function readSave(json: string, content: Content): SaveResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'corrupt', message: 'Save is not valid JSON' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, reason: 'corrupt', message: 'Save is not an object' };
  }
  const version: unknown = (data as { version?: unknown }).version;
  if (version !== SAVE_VERSION) {
    return { ok: false, reason: 'old_version', message: `Save has format version ${String(version)}, this game reads ${SAVE_VERSION}` };
  }
  try {
    const problems = checkInvariants(data as GameState, content);
    if (problems.length > 0) return { ok: false, reason: 'corrupt', message: `Invalid save: ${problems.join('; ')}` };
  } catch (error) {
    return { ok: false, reason: 'corrupt', message: `Invalid save: ${error instanceof Error ? error.message : String(error)}` };
  }
  return { ok: true, state: data as GameState };
}

export function deserialize(json: string, content: Content): GameState {
  const result = readSave(json, content);
  if (!result.ok) throw new Error(result.message);
  return result.state;
}
