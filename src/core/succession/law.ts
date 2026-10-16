import { childrenOf, marriagesOf, parentsOf, siblingsOf } from '../family/kin';
import { findCharacter } from '../helpers';
import { opinionValue } from '../relations/opinions';
import type { Character, Ctx, GameState } from '../state';
import { ageYears } from '../time/calendar';

/**
 * The law of succession (D-314, D-315, D-361): pure queries, no randomness, no changes. They read the hot part only,
 * as every rule does (D-312); the kin of the living stay there (parents of the hot people, the household, the circle).
 */

const alive = (c: Character): boolean => c.deathDay === null;

/** Sons before daughters, the eldest first; equal birth days keep the order of creation. */
function byLaw(people: Character[]): Character[] {
  return people
    .map((c, i) => ({ c, i }))
    .sort((x, y) => (x.c.sex === y.c.sex ? 0 : x.c.sex === 'male' ? -1 : 1) || x.c.birthDay - y.c.birthDay || x.i - y.i)
    .map((x) => x.c);
}

/**
 * Living descendants of a person in the order of the law: the living children (sons, then daughters, the eldest
 * first), then the lines of the children in the same order — of the dead ones as in D-314, and below the living ones.
 */
function descendants(state: GameState, id: string, seen: Set<string>): Character[] {
  const children = byLaw(childrenOf(state, id).filter((c) => !seen.has(c.id)));
  for (const c of children) seen.add(c.id);
  const out = children.filter(alive);
  for (const c of children) out.push(...descendants(state, c.id, seen));
  return out;
}

/** A group of kin and their lines: the living of the group first, then the descendants of each, in the order of the law. */
function group(state: GameState, people: Character[], seen: Set<string>): Character[] {
  const fresh = byLaw(people.filter((c) => !seen.has(c.id)));
  for (const c of fresh) seen.add(c.id);
  const out = fresh.filter(alive);
  for (const c of fresh) out.push(...descendants(state, c.id, seen));
  return out;
}

/**
 * Everyone who may inherit from `deceased`, in the order of the law (D-314): descendants (living children first, then
 * the lines of dead children), then brothers and sisters and their lines, then parents and their lines. The first one
 * is the heir by law. Only known living kin (D-315): no distant relative.
 */
export function lawOrder(state: GameState, deceasedId: string): Character[] {
  const seen = new Set<string>([deceasedId]);
  const out = descendants(state, deceasedId, seen);
  out.push(...group(state, siblingsOf(state, deceasedId), seen));
  out.push(...group(state, parentsOf(state, deceasedId), seen));
  return out;
}

/** The person a will may name as the main heir: any of the kin the law knows (D-314). */
export function willHeirs(state: GameState, headId: string): Character[] {
  return lawOrder(state, headId);
}

export type HeirBasis = 'will' | 'law';

/**
 * Who inherits from `head` now (D-018: seen while the head lives): the heir of the will if they are still among the
 * kin, otherwise the first one by law; null when there is no kin (the placeholder heir of D-007 or the end, D-315).
 */
export function heirOf(state: GameState, headId: string): { heir: Character; by: HeirBasis } | null {
  const order = lawOrder(state, headId);
  const named = state.will?.heir ?? null;
  const byWill = named === null ? undefined : order.find((c) => c.id === named);
  if (byWill) return { heir: byWill, by: 'will' };
  const first = order[0];
  return first ? { heir: first, by: 'law' } : null;
}

/** Whether `c` could be a guardian of `ward`: alive, of age, neither the ward nor the dead head. */
export function canGuard(ctx: Ctx, c: Character | null, ward: Character, deceasedId: string | null): c is Character {
  if (!c || !alive(c) || c.id === ward.id || c.id === deceasedId) return false;
  return ageYears(c.birthDay, ctx.state.day) >= ctx.content.settings.adultAge;
}

/**
 * The guardian the law gives a ward under `adultAge` (D-314, D-362): a living parent; otherwise the eldest grown-up
 * relative (brothers and sisters, grandparents, uncles and aunts — the kin of the ward and of the parents); otherwise
 * the grown-up of the circle with the best opinion of the ward. Null when there is nobody.
 */
export function lawGuardian(ctx: Ctx, ward: Character, deceasedId: string | null): Character | null {
  const { state } = ctx;
  const fits = (c: Character | null): c is Character => canGuard(ctx, c, ward, deceasedId);
  const parents = parentsOf(state, ward.id);
  const parent = parents.find(fits);
  if (parent) return parent;
  const kin = new Map<string, Character>();
  const add = (cs: Character[]) => cs.filter(fits).forEach((c) => kin.set(c.id, c));
  add(siblingsOf(state, ward.id));
  for (const p of parents) {
    add(parentsOf(state, p.id));
    add(siblingsOf(state, p.id));
  }
  const eldest = [...kin.values()].sort((a, b) => a.birthDay - b.birthDay)[0];
  if (eldest) return eldest;
  let best: Character | null = null;
  let top = -Infinity;
  for (const id of state.circle) {
    const c = findCharacter(state, id);
    if (!fits(c)) continue;
    const value = opinionValue(ctx, c.id, ward.id);
    if (value > top) {
      top = value;
      best = c;
    }
  }
  return best;
}

/** People who could be named guardian in a will: grown-ups near the hero (household and circle), not the hero. */
export function willGuardians(ctx: Ctx, head: Character): Character[] {
  const { state } = ctx;
  return [...state.household, ...state.circle].flatMap((id) => {
    const c = findCharacter(state, id);
    return canGuard(ctx, c, head, null) ? [c as Character] : [];
  });
}

/** The current spouse of the dead on the day of the death: a marriage that has not ended, or ended by this death. */
export function widowOf(state: GameState, deceased: Character): Character | null {
  for (const m of marriagesOf(state, deceased.id)) {
    if (m.end !== null && m.end !== deceased.deathDay) continue;
    const other = findCharacter(state, m.a === deceased.id ? m.b : m.a);
    if (other && alive(other)) return other;
  }
  return null;
}
