import { isInt } from '../helpers';
import type { Content } from '../content/schema';
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

/** The word of a happiness ("content"), from the bands of `mind.words`; empty without `mind`. */
export function happinessWord(content: Content, value: number): string {
  const words = content.mind?.words ?? [];
  return (words.find((w) => value <= w.upTo) ?? words.at(-1))?.word ?? '';
}

/** The mood of the portrait by happiness (`mind.moods`), or null without `mind`: the screen shows it when no event sets one. */
export function happinessMood(content: Content, value: number | null): string | null {
  const moods = content.mind?.moods ?? [];
  if (value === null || moods.length === 0) return null;
  return (moods.find((m) => value <= m.upTo) ?? moods.at(-1))?.mood ?? null;
}

/** Moves the hero's happiness by `delta`, kept within the range of `mind.happiness`; nothing without `mind`. */
export function shiftHappiness(state: GameState, content: Content, delta: number): void {
  const range = content.mind?.happiness;
  const h = state.mind.happiness;
  if (!range || h === null) return;
  state.mind.happiness = Math.min(range.max, Math.max(range.min, h + delta));
}

export const mindInvariants: Invariant = ({ state, content }) => {
  const h = state.mind.happiness;
  const range = content.mind?.happiness ?? null;
  if (!range) return h === null ? [] : ['happiness without mind in the content'];
  if (h === null || !isInt(h)) return [`happiness is ${String(h)}, not a whole number`];
  return h < range.min || h > range.max ? [`happiness ${h} is outside ${range.min}…${range.max}`] : [];
};
