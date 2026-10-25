import { Int } from '../content/types';
import type { Character, Ctx, Scope } from '../state';

/**
 * Effect key of this module (D-457, S.9a): `happiness: ±N` moves the hero's happiness, kept within the range of
 * `mind.happiness`. Only the hero has happiness (D-461): on anyone else, and without `mind` in the content, it does
 * nothing. Like every file that feeds effects.ts, this one must not import effects.ts (import cycle).
 */
export const mindEffectShape = {
  happiness: Int.optional(),
};

interface MindEffects {
  happiness?: number | undefined;
}

export function applyMindEffects(ctx: Ctx, c: Character, effects: MindEffects, _scope: Scope): void {
  if (effects.happiness === undefined) return;
  const { state, content } = ctx;
  const range = content.mind?.happiness;
  const h = state.mind.happiness;
  if (!range || h === null || c.id !== state.playerId) return;
  state.mind.happiness = Math.min(range.max, Math.max(range.min, h + effects.happiness));
}
