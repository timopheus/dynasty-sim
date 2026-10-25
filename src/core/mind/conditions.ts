import type { Unmet } from '../condition-keys';
import { fillReason } from '../conditions/reasons';
import { Int } from '../content/types';
import type { Character, Ctx, Scope } from '../state';
import { happinessOf } from './mind';

/**
 * Condition keys of this module (D-457, S.9a); they name nobody else:
 * - `happiness_min: N` / `happiness_max: N` — the hero's happiness is at least / at most N.
 * The hero knows his own happiness, so the reason is visible (`mind.reasons`). Only the hero has happiness (D-461): for
 * anyone else, and without `mind` in the content, the condition is unmet and hidden.
 */
export const mindConditionShape = {
  happiness_min: Int.optional(),
  happiness_max: Int.optional(),
};

interface MindWhen {
  happiness_min?: number | undefined;
  happiness_max?: number | undefined;
}

export function checkMindConditions(ctx: Ctx, c: Character, when: MindWhen, _scope: Scope): Unmet[] {
  if (when.happiness_min === undefined && when.happiness_max === undefined) return [];
  const { state, content } = ctx;
  const h = happinessOf(state, c);
  const mind = content.mind;
  if (!mind || h === null) return [{ text: '', hidden: true }];
  const out: Unmet[] = [];
  if (when.happiness_min !== undefined && h < when.happiness_min) {
    out.push({ text: fillReason(mind.reasons.happiness_min, { value: String(when.happiness_min) }), hidden: false });
  }
  if (when.happiness_max !== undefined && h > when.happiness_max) {
    out.push({ text: fillReason(mind.reasons.happiness_max, { value: String(when.happiness_max) }), hidden: false });
  }
  return out;
}
