import { findCharacter } from '../helpers';
import type { Character, GameState } from '../state';
import type { Marriage } from './family';

/**
 * Kinship queries (4.1 contract, D-313): pure reads of `father`, `mother` and the marriages, no randomness. They see
 * the hot part only, as every rule does (D-312): the people rules need (parents of the living, spouses) stay there.
 * Results keep the order of the state: characters by creation, marriages by start.
 */

function known(state: GameState, id: string | null): Character | null {
  return id === null ? null : findCharacter(state, id);
}

/** Known parents: the father first, then the mother. */
export function parentsOf(state: GameState, id: string): Character[] {
  const c = findCharacter(state, id);
  if (!c) return [];
  return [known(state, c.father), known(state, c.mother)].filter((p): p is Character => p !== null);
}

/** Children with this person as father or mother, in the order they were created. */
export function childrenOf(state: GameState, id: string): Character[] {
  return state.characters.filter((c) => c.father === id || c.mother === id);
}

/** Marriages of the person, ended ones included, in the order they began. */
export function marriagesOf(state: GameState, id: string): Marriage[] {
  return state.marriages.filter((m) => m.a === id || m.b === id);
}

/** Everyone the person has been married to, in the order of the marriages; the current spouse has `end === null`. */
export function spousesOf(state: GameState, id: string): Character[] {
  return marriagesOf(state, id).flatMap((m) => {
    const other = findCharacter(state, m.a === id ? m.b : m.a);
    return other ? [other] : [];
  });
}

/** Brothers and sisters, half-siblings included: people sharing a known parent. Never the person. */
export function siblingsOf(state: GameState, id: string): Character[] {
  const c = findCharacter(state, id);
  if (!c) return [];
  const parents = [c.father, c.mother].filter((p): p is string => p !== null);
  if (parents.length === 0) return [];
  return state.characters.filter((o) => o.id !== id && ((o.father !== null && parents.includes(o.father)) || (o.mother !== null && parents.includes(o.mother))));
}

/** True if `ancestor` is a known parent, grandparent… of `id`. */
export function isAncestor(state: GameState, ancestor: string, id: string): boolean {
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const c = findCharacter(state, stack.pop() as string);
    if (!c) continue;
    for (const p of [c.father, c.mother]) {
      if (p === null || seen.has(p)) continue;
      if (p === ancestor) return true;
      seen.add(p);
      stack.push(p);
    }
  }
  return false;
}

/** True if the two share a known parent; a direct comparison, so the rules can ask it often (4.5). */
function shareParent(state: GameState, a: string, b: string): boolean {
  const x = findCharacter(state, a);
  const y = findCharacter(state, b);
  if (!x || !y || x.id === y.id) return false;
  const theirs = [y.father, y.mother];
  return [x.father, x.mother].some((p) => p !== null && theirs.includes(p));
}

/**
 * Kin too close to marry (D-313): ancestor and descendant, brothers and sisters (half ones too), an uncle or aunt and
 * a nephew or niece. Cousins are not close kin. A person is close kin to themself.
 */
export function isCloseKin(state: GameState, a: string, b: string): boolean {
  if (a === b) return true;
  if (isAncestor(state, a, b) || isAncestor(state, b, a)) return true;
  if (shareParent(state, a, b)) return true;
  // uncle or aunt: a sibling of a parent, either way round
  return parentsOf(state, b).some((p) => shareParent(state, a, p.id)) || parentsOf(state, a).some((p) => shareParent(state, b, p.id));
}

/** The kinds of kin of conditions and roles (4.5): the spouse now, a child, a parent, a brother or sister. */
export type KinKindId = 'spouse' | 'child' | 'parent' | 'sibling';

/** Kin of this kind of the person `of`, living or dead, in the order of the state. The spouse is the one of now. */
export function kinOf(state: GameState, kind: KinKindId, of: string): Character[] {
  if (kind === 'spouse') {
    const id = findCharacter(state, of)?.spouse ?? null;
    const spouse = id === null ? null : findCharacter(state, id);
    return spouse ? [spouse] : [];
  }
  if (kind === 'child') return childrenOf(state, of);
  if (kind === 'parent') return parentsOf(state, of);
  return siblingsOf(state, of);
}

/** True if `id` is the `kind` of `of`: `isKin(state, 'child', son, father)`. */
export function isKin(state: GameState, kind: KinKindId, id: string, of: string): boolean {
  if (id === of) return false;
  if (kind === 'spouse') return findCharacter(state, of)?.spouse === id;
  const c = findCharacter(state, kind === 'child' ? id : of);
  const other = kind === 'child' ? of : id;
  if (kind === 'child' || kind === 'parent') return c !== null && (c.father === other || c.mother === other);
  return shareParent(state, id, of);
}
