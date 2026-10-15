import type { Content } from '../content/schema';
import { checkInvariants } from '../invariants';
import type { GameState } from '../state';

export { SAVE_VERSION } from './version';

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

export function deserialize(json: string, content: Content): GameState {
  const state = JSON.parse(json) as GameState;
  const problems = checkInvariants(state, content);
  if (problems.length > 0) throw new Error(`Invalid save: ${problems.join('; ')}`);
  return state;
}
