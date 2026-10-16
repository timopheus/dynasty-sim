import { int } from '../rng';
import type { Character, Ctx } from '../state';
import { sceneOf, scenePath, ownOutcome, type EventDef, type OptionDef } from './content';
import { answerOption, openEvent, optionState, resolveOutcome } from './events';

/** Weight of an option that has no `ai` (3.9): the person of the world has no leaning, all such options are equal. */
export const DEFAULT_AI_WEIGHT = 1;

/** Weight of the option for the person: `ai.base` plus the value of every trait they hold, not below 0 (3.9). */
export function aiWeight(option: OptionDef, person: Character): number {
  if (!option.ai) return DEFAULT_AI_WEIGHT;
  let weight = option.ai.base;
  for (const [trait, value] of Object.entries(option.ai.traits ?? {})) if (person.traits.includes(trait)) weight += value;
  return Math.max(0, weight);
}

/**
 * The option a person of the world takes: by `ai` weights among the options available to them (D-043). If every weight
 * is 0 the available options are equal. Null if none is available. Spends one number of the world stream if there is a
 * choice.
 */
export function pickNpcOption(ctx: Ctx, options: readonly OptionDef[], person: Character, scope: Parameters<typeof optionState>[3]): number | null {
  const open = options.flatMap((option, index) => (optionState(ctx, option, person, scope).available ? [{ index, weight: aiWeight(option, person) }] : []));
  if (open.length === 0) return null;
  if (open.length === 1) return (open[0] as { index: number }).index;
  const sum = open.reduce((s, o) => s + o.weight, 0);
  if (sum === 0) return (open[int(ctx.state.rng, 0, open.length - 1)] as { index: number }).index;
  let roll = int(ctx.state.rng, 1, sum);
  for (const o of open) {
    roll -= o.weight;
    if (roll <= 0) return o.index;
  }
  return (open.at(-1) as { index: number }).index;
}

/**
 * Carries out the event of a person of the world at once (D-047, D-166): fills the roles (the hero never gets one), at
 * every scene with options the person chooses by their `ai` weights, a check is rolled with the person's stat, and the
 * outcomes apply as usual except for the effects on the hero (D-174). Nothing waits for the player. False, with
 * nothing changed, if a role could not be filled.
 */
export function runNpcEvent(ctx: Ctx, event: EventDef, person: Character): boolean {
  const { state } = ctx;
  const pending = openEvent(ctx, event, person);
  if (!pending) return false;
  while (state.pendingEvent) {
    const scene = sceneOf(event, pending.page);
    const path = scenePath(pending.page);
    if (!scene.options) {
      resolveOutcome(ctx, event, pending, ownOutcome(scene), path, false);
      continue;
    }
    const index = pickNpcOption(ctx, scene.options, person, pending.scope);
    // The validator wants an option without `when` in every scene, so this does not happen.
    if (index === null) throw new Error(`Event "${event.id}": no option is available to ${person.id}`);
    answerOption(ctx, event, pending, scene.options[index] as OptionDef, `${path}options.${index}.`, person);
  }
  return true;
}
