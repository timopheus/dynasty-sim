import type { Invariant, RefsFn } from '../state';

/**
 * Succession part of the game state (stage 4, D-236, D-314, D-315). 4.1 wires the part; 4.6 fills it.
 */
export interface Will {
  /** Day the notary action ended and the will took effect. */
  day: number;
  /** Main heir named in the will; null leaves it to the law. */
  heir: string | null;
  /** Guardian of an heir under `adultAge`; null leaves it to the law. */
  guardian: string | null;
  /** Who gets each heirloom (4.9). */
  items: { item: string; to: string }[];
}

export interface SuccessionState {
  /** The will of the current head, or null. */
  will: Will | null;
  /** Guardian of a head under `adultAge` (D-314); null otherwise. */
  guardian: string | null;
}

export function initSuccessionState(): SuccessionState {
  return { will: null, guardian: null };
}

/** People the succession part of the hot data refers to (D-312): 4.6 names the will and the guardian. */
export const successionRefs: RefsFn = () => [];

export const successionInvariants: Invariant = ({ state }) => {
  const problems: string[] = [];
  if (state.guardian !== null && typeof state.guardian !== 'string') problems.push('guardian is not an id');
  if (state.will !== null && (typeof state.will !== 'object' || !Array.isArray(state.will.items))) problems.push('will is not a will');
  return problems;
};
