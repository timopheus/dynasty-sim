import type { Content } from '../content/schema';
import { findCharacter, isInt } from '../helpers';
import type { DeathHook, GameState, Invariant, RefsFn, SuccessionHook } from '../state';

/**
 * Favors (CK.2a, D-474; the hooks of CK3): a person owes another one a favor. A weak favor is called in once and lapses
 * after `favors.weakDays` (10 years); a strong one is never used up, but after it is called in it rests
 * `favors.strongRestDays` (5 years). One person owes another at most one favor: a new one keeps the stronger of the two
 * and the later term. Contracts give favors (CK.3), interactions spend them (CK.7). With the house the heir takes the
 * favors the dead head held and the ones he owed, as weak ones, for one generation (D-375; CK3 hooks).
 */
export type FavorStrength = 'weak' | 'strong';

export interface Favor {
  /** Who owes the favor. */
  from: string;
  /** Who holds it and may call it in. */
  to: string;
  strength: FavorStrength;
  /** Day it was granted (or passed to the heir). */
  day: number;
  /** The last day a weak favor may be called in; null for a strong one. */
  until: number | null;
  /** Day a strong favor was last called in, so it rests; null if never, and always for a weak one. */
  used: number | null;
  /** Passed with the house: it does not pass again (D-375). */
  inherited: boolean;
}

export interface FavorsState {
  favors: Favor[];
}

export function initFavorsState(): FavorsState {
  return { favors: [] };
}

/** The favor `from` owes `to`, or null. Pure. */
export function favorBetween(state: GameState, from: string, to: string): Favor | null {
  return state.favors.find((f) => f.from === from && f.to === to) ?? null;
}

/** Whether the favor can be called in today: a weak one within its term, a strong one not resting. Pure. */
export function usable(state: GameState, content: Content, f: Favor): boolean {
  if (f.strength === 'weak') return f.until !== null && state.day <= f.until;
  const rest = content.favors?.strongRestDays ?? 0;
  return f.used === null || state.day - f.used >= rest;
}

/**
 * `from` now owes `to` a favor of this strength. With a favor already owed the stronger strength stays, and a weak one
 * gets a fresh term. Nobody owes himself; the dead owe nothing.
 */
export function grantFavor(state: GameState, content: Content, from: string, to: string, strength: FavorStrength): void {
  if (from === to || !content.favors) return;
  const debtor = findCharacter(state, from);
  const holder = findCharacter(state, to);
  if (!debtor || !holder || debtor.deathDay !== null || holder.deathDay !== null) return;
  const until = state.day + content.favors.weakDays;
  const known = favorBetween(state, from, to);
  if (!known) {
    state.favors.push({ from, to, strength, day: state.day, until: strength === 'weak' ? until : null, used: null, inherited: false });
    return;
  }
  known.day = state.day;
  known.inherited = false;
  if (known.strength === 'strong') return;
  known.strength = strength;
  known.until = strength === 'weak' ? until : null;
}

/** `to` calls in the favor `from` owes: a weak one is spent, a strong one rests. Returns whether there was one to call in. */
export function useFavor(state: GameState, content: Content, from: string, to: string): boolean {
  const f = favorBetween(state, from, to);
  if (!f || !usable(state, content, f)) return false;
  if (f.strength === 'weak') state.favors = state.favors.filter((x) => x !== f);
  else f.used = state.day;
  return true;
}

/** The favors of a dead person go, but the hero's wait for his heir (`favorsOnSuccession`). */
export const favorsOnDeath: DeathHook = ({ state }, c) => {
  if (c.id !== state.playerId) state.favors = state.favors.filter((f) => f.from !== c.id && f.to !== c.id);
};

/**
 * The heir takes the favors of the dead head (D-375, D-474; CK3 hooks): those he held and those he owed, each as a weak
 * one, once — a favor already passed with the house goes with him. A strong favor passes with the full `weakDays`, a
 * weak one keeps its term but runs at most `inheritedDays`. A favor between the dead and the heir himself goes, and one
 * the heir already has with the same person stays as it is.
 */
export const favorsOnSuccession: SuccessionHook = (ctx, deceased, heir) => {
  const { state, content } = ctx;
  const weakDays = content.favors?.weakDays ?? 0;
  const inheritedDays = content.favors?.inheritedDays ?? 0;
  const before = state.favors;
  const kept: Favor[] = [];
  for (const f of before) {
    const held = f.to === deceased.id;
    if (!held && f.from !== deceased.id) {
      kept.push(f);
      continue;
    }
    const other = held ? f.from : f.to;
    const from = held ? other : heir.id;
    const to = held ? heir.id : other;
    if (f.inherited || other === heir.id || before.some((g) => g.from === from && g.to === to)) continue;
    const until = f.strength === 'strong' || f.until === null ? state.day + weakDays : Math.min(f.until, state.day + inheritedDays);
    if (until < state.day) continue;
    kept.push({ from, to, strength: 'weak', day: state.day, until, used: null, inherited: true });
  }
  state.favors = kept;
};

/** Both sides of every favor stay in the hot part (D-312). */
export const favorsRefs: RefsFn = ({ state }) => state.favors.flatMap((f) => [f.from, f.to]);

export const favorsInvariants: Invariant = ({ state, content }) => {
  const problems: string[] = [];
  if (!content.favors && state.favors.length > 0) problems.push('favors in the state without favors in the content');
  const pairs = new Set<string>();
  for (const f of state.favors) {
    const what = `favor of ${f.from} to ${f.to}`;
    if (pairs.has(`${f.from}|${f.to}`)) problems.push(`${what} twice`);
    pairs.add(`${f.from}|${f.to}`);
    if (f.from === f.to) problems.push(`${what}: owed to oneself`);
    if (!findCharacter(state, f.from) || !findCharacter(state, f.to)) problems.push(`${what}: unknown person`);
    if (f.strength !== 'weak' && f.strength !== 'strong') problems.push(`${what}: strength ${String(f.strength)}`);
    if (!isInt(f.day)) problems.push(`${what}: day ${String(f.day)}`);
    if (f.strength === 'weak' && (!isInt(f.until) || f.used !== null)) problems.push(`${what}: a weak favor has a term and is never used`);
    if (f.strength === 'strong' && (f.until !== null || (f.used !== null && !isInt(f.used)))) problems.push(`${what}: a strong favor has no term`);
    if (typeof f.inherited !== 'boolean') problems.push(`${what}: inherited is not true or false`);
  }
  return problems;
};
