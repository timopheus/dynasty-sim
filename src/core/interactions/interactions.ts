import { findCharacter, isInt } from '../helpers';
import type { Invariant, RefsFn } from '../state';

/**
 * Interactions with people (CK.2a; CK.7 fills them): the command `interact {id, target}` aims an interaction of
 * `interactions.list` at a person near the hero. It moves no time. The part of the state remembers when the hero last did
 * an interaction with a cooldown to whom, so it waits its days; records past their cooldown are dropped at the next one.
 */
export interface InteractionRecord {
  id: string;
  target: string;
  day: number;
}

export interface InteractionsState {
  interactions: { recent: InteractionRecord[] };
}

export function initInteractionsState(): InteractionsState {
  return { interactions: { recent: [] } };
}

/** The people of the recent interactions stay in the hot part while their cooldown runs (D-312). */
export const interactionsRefs: RefsFn = ({ state }) => state.interactions.recent.map((r) => r.target);

export const interactionsInvariants: Invariant = ({ state, content }) => {
  const problems: string[] = [];
  const list = content.interactions?.list ?? [];
  for (const r of state.interactions.recent) {
    const def = list.find((x) => x.id === r.id);
    if (!def) problems.push(`recent interaction of unknown kind ${r.id}`);
    else if (def.cooldown_days === undefined) problems.push(`recent interaction ${r.id} has no cooldown to wait`);
    if (!findCharacter(state, r.target)) problems.push(`recent interaction ${r.id} with unknown person ${r.target}`);
    if (!isInt(r.day) || r.day > state.day) problems.push(`recent interaction ${r.id} on day ${String(r.day)}`);
  }
  return problems;
};
