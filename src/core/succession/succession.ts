import { findCharacter, getPlayer, isInt } from '../helpers';
import { activeRelationBetween } from '../relations/links';
import type { Invariant, RefsFn } from '../state';
import { ageYears } from '../time/calendar';

/**
 * Succession part of the game state (stage 4, D-236, D-314, D-315, D-360).
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
  /** Out of date (D-314): a child was born after it, or a person it named died. Writing a new will clears it. */
  stale: boolean;
}

/** The terms of a `will` command while the notary action runs; they become the will at its end (D-360). */
export interface WillDraft {
  heir: string | null;
  guardian: string | null;
  items: { item: string; to: string }[];
}

export interface SuccessionState {
  /** The will of the current head, or null. */
  will: Will | null;
  /**
   * The will of the previous head as it stood at the change of head (D-360): the succession hooks (4.9: heirlooms)
   * read it after `succeed` has cleared `will`. Null when the previous head left none.
   */
  executedWill: Will | null;
  /** Terms waiting for the end of the notary action; null when none is being drawn up. */
  willDraft: WillDraft | null;
  /** Guardian of a head under `adultAge` (D-314); null otherwise. */
  guardian: string | null;
}

export function initSuccessionState(): SuccessionState {
  return { will: null, executedWill: null, willDraft: null, guardian: null };
}

function termsRefs(terms: WillDraft | null): string[] {
  if (!terms) return [];
  return [terms.heir, terms.guardian, ...terms.items.map((i) => i.to)].filter((id): id is string => id !== null);
}

/** People the succession part refers to (D-312): those named in the wills and the draft, and the guardian. */
export const successionRefs: RefsFn = ({ state }) => [...termsRefs(state.will), ...termsRefs(state.executedWill), ...termsRefs(state.willDraft), ...(state.guardian === null ? [] : [state.guardian])];

export const successionInvariants: Invariant = ({ state, content }) => {
  const problems: string[] = [];
  const terms = (what: string, t: WillDraft) => {
    for (const id of termsRefs(t)) if (!findCharacter(state, id)) problems.push(`${what} names unknown character ${id}`);
    if (!Array.isArray(t.items)) problems.push(`${what} has no list of items`);
  };
  if (state.will !== null) {
    terms('will', state.will);
    if (!isInt(state.will.day) || state.will.day > state.day) problems.push(`will is dated day ${String(state.will.day)}`);
    if (typeof state.will.stale !== 'boolean') problems.push('will has no stale flag');
  }
  if (state.executedWill !== null) terms('executed will', state.executedWill);
  if (state.willDraft !== null) terms('will draft', state.willDraft);
  const guardianId = state.guardian;
  if (guardianId !== null) {
    const guardian = findCharacter(state, guardianId);
    if (!guardian) problems.push(`guardian ${guardianId} is unknown`);
    else if (guardian.deathDay !== null) problems.push(`guardian ${guardianId} is dead`);
    if (state.status !== 'ended') {
      const hero = getPlayer(state);
      if (ageYears(hero.birthDay, state.day) >= content.settings.adultAge) problems.push(`the hero ${hero.id} is of age but has a guardian`);
      const kind = content.succession?.guardianRelation;
      if (kind !== undefined && guardian && guardian.deathDay === null && !activeRelationBetween(state, guardianId, hero.id, kind)) {
        problems.push(`guardian ${guardianId} has no ${kind} relation with the hero`);
      }
    }
  }
  return problems;
};
