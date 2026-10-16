import type { CreateHook, DeathHook, Invariant, MarriageHook, RefsFn } from '../state';

/**
 * House part of the game state (stage 4, D-237, D-316). A house is an entity `h…` (D-311): the hero's house and the
 * houses of spouses. 4.1 wires the part; 4.7 fills it (name, status, renown, nicknames of former heads).
 */
export interface House {
  id: string;
  /** The surname the house is known by. */
  name: string;
}

export interface HouseState {
  /** In the order they were made. */
  houses: House[];
}

/** House part of a character. */
export interface HouseCharacter {
  /** Id of the house the person belongs to; null when none is known. */
  house: string | null;
}

export function initHouseState(): HouseState {
  return { houses: [] };
}

/** 4.7: a child takes the house of the father, of a heroine-head hers (D-313). */
export const createHouse: CreateHook = (_ctx, c) => {
  c.house = null;
};

export const houseOnDeath: DeathHook = () => {};

/**
 * A marriage was made (MARRIAGE_HOOKS of hooks.ts, called by the marriage of family/, 4.5). 4.7: the house of the spouse
 * is made when they marry into the hero's house. Lives here, not in phases.ts: the marriage is an effect, and a file an
 * effect reaches must not import events/ or lifecycle.ts.
 */
export const houseOnMarriage: MarriageHook = () => {};

/** People the house part of the hot data refers to (D-312); none yet. */
export const houseRefs: RefsFn = () => [];

export const houseInvariants: Invariant = ({ state }) => {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const h of state.houses) {
    if (ids.has(h.id)) problems.push(`duplicate house id ${h.id}`);
    ids.add(h.id);
  }
  for (const c of state.characters) {
    if (c.house !== null && !ids.has(c.house)) problems.push(`${c.id} belongs to unknown house ${String(c.house)}`);
  }
  return problems;
};
