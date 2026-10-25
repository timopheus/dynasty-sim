import { isInt } from '../helpers';
import type { Character, GameState, Invariant } from '../state';

/**
 * The hero's happiness (D-457, S.9a points; S.10 fills the rules): a visible whole number instead of the hidden stress
 * planned before. Only the hero has it (D-461): the heir starts from the base (`mindOnSuccession`). Null without the
 * key `mind` in the content.
 */
export interface MindState {
  mind: { happiness: number | null };
}

export function initMindState(): MindState {
  return { mind: { happiness: null } };
}

/** Happiness of the character: a number for the hero, null for anyone else or without `mind` in the content. */
export function happinessOf(state: GameState, c: Character): number | null {
  return c.id === state.playerId ? state.mind.happiness : null;
}

export const mindInvariants: Invariant = ({ state, content }) => {
  const h = state.mind.happiness;
  const range = content.mind?.happiness ?? null;
  if (!range) return h === null ? [] : ['happiness without mind in the content'];
  if (h === null || !isInt(h)) return [`happiness is ${String(h)}, not a whole number`];
  return h < range.min || h > range.max ? [`happiness ${h} is outside ${range.min}…${range.max}`] : [];
};
