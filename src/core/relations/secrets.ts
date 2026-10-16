import { newId } from '../helpers';
import type { Ctx, GameState } from '../state';
import { characterById } from '../world/world';
import type { Secret } from './types';

/** A new secret about a person; `knownBy` are the people who know it from the start (GDD 8.8). */
export function addSecret(ctx: Ctx, about: string, kind: string, knownBy: readonly string[]): Secret {
  const { state } = ctx;
  for (const id of [about, ...knownBy]) if (!characterById(state, id)) throw new Error(`Unknown character ${id}`);
  const secret: Secret = { id: newId(state, 's'), about, kind, day: state.day, knownBy: [...new Set(knownBy)] };
  state.secrets.push(secret);
  return secret;
}

/** Someone learns a secret (by an event, by spying, from a third person). Returns whether they did not know it. */
export function revealSecret(ctx: Ctx, secret: Secret, to: string): boolean {
  if (!characterById(ctx.state, to)) throw new Error(`Unknown character ${to}`);
  if (secret.knownBy.includes(to)) return false;
  secret.knownBy.push(to);
  return true;
}

export function secretsKnownBy(state: GameState, id: string): Secret[] {
  return state.secrets.filter((s) => s.knownBy.includes(id));
}

export function secretsAbout(state: GameState, id: string): Secret[] {
  return state.secrets.filter((s) => s.about === id);
}
