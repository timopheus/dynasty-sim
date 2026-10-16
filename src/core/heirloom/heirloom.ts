import type { Invariant, RefsFn } from '../state';

/**
 * Heirloom part of the game state (stage 4, D-238). An heirloom is an entity `i…` (D-311). 4.1 wires the part; 4.9
 * fills it (kind, history, sold or lost).
 */
export interface Heirloom {
  id: string;
  name: string;
  /** Id of the person who holds it; null when lost or sold. */
  owner: string | null;
}

export interface HeirloomState {
  /** In the order they were made; never removed. */
  heirlooms: Heirloom[];
}

export function initHeirloomState(): HeirloomState {
  return { heirlooms: [] };
}

/** People the heirloom part of the hot data refers to (D-312); 4.9: the owners. */
export const heirloomRefs: RefsFn = () => [];

export const heirloomInvariants: Invariant = ({ state }) => {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const h of state.heirlooms) {
    if (ids.has(h.id)) problems.push(`duplicate heirloom id ${h.id}`);
    ids.add(h.id);
  }
  return problems;
};
