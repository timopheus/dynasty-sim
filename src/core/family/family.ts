import { findCharacter, isInt } from '../helpers';
import type { CreateHook, DeathHook, Invariant, RefsFn } from '../state';

/**
 * Family part of the game state (stage 4, D-235, D-313). Kinship is kept in two places: `father` and `mother` of a
 * character, and the marriages here, as a list of records (D-195), not a map. An unknown ancestor is null.
 * 4.1 wires the part; 4.5 fills it (marriages, births, pedigrees of the circle).
 */
export interface Marriage {
  /** The two spouses; no order. */
  a: string;
  b: string;
  start: number;
  /** Day the marriage ended (a death); null while it lasts. */
  end: number | null;
  /** Why it ended, e.g. `death`; null while it lasts. */
  endReason: string | null;
}

export interface FamilyState {
  /** In the order they were made. */
  marriages: Marriage[];
}

/** Family part of a character. */
export interface FamilyCharacter {
  /** Ids of the parents; null when unknown (D-313: dead ancestors are never made up). */
  father: string | null;
  mother: string | null;
}

export function initFamilyState(): FamilyState {
  return { marriages: [] };
}

export const createFamily: CreateHook = (_ctx, c, spec) => {
  c.father = spec.father ?? null;
  c.mother = spec.mother ?? null;
};

/** 4.5: a death ends the marriages of the dead (widowhood). */
export const familyOnDeath: DeathHook = () => {};

/** People the family part of the hot data refers to (D-312); 4.5: parents of the living, spouses. */
export const familyRefs: RefsFn = () => [];

export const familyInvariants: Invariant = ({ state }) => {
  const problems: string[] = [];
  for (const c of state.characters) {
    for (const parent of [c.father, c.mother]) {
      if (parent === null) continue;
      if (typeof parent !== 'string' || parent === c.id) problems.push(`${c.id} has an invalid parent ${String(parent)}`);
      // Parents of the living stay in the hot part (D-312), so they can be looked up.
      else if (c.deathDay === null && !findCharacter(state, parent)) problems.push(`${c.id} has an unknown parent ${parent}`);
    }
  }
  for (const m of state.marriages) {
    if (m.a === m.b) problems.push(`${m.a} is married to themself`);
    if (!isInt(m.start) || m.start > state.day) problems.push(`marriage ${m.a} - ${m.b} has an invalid start ${m.start}`);
    if (m.end !== null && (!isInt(m.end) || m.end < m.start || m.end > state.day)) problems.push(`marriage ${m.a} - ${m.b} has an invalid end ${m.end}`);
    if ((m.end === null) !== (m.endReason === null)) problems.push(`marriage ${m.a} - ${m.b} has an end without a reason or back`);
  }
  return problems;
};
