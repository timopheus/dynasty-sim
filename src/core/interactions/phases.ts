import { conditionReport } from '../condition-keys';
import { applyEffects } from '../effects';
import { findCharacter, getPlayer } from '../helpers';
import type { Ctx } from '../state';
import { isNear } from '../world/world';
import type { InteractionDef } from './content';

/** The command `interact` (CK.2a): an interaction of `interactions.list` aimed at a person near the hero. */
export interface InteractOrder {
  id: string;
  target: string;
}

export interface InteractionAvailability {
  interaction: InteractionDef;
  /** Texts of the visible conditions that are not met, the cooldown included (D-043). */
  unmet: string[];
  /** Some condition the player must not see is not met: the interaction is not shown. */
  hidden: boolean;
}

function resting(ctx: Ctx, def: InteractionDef, target: string): boolean {
  const days = def.cooldown_days;
  if (days === undefined) return false;
  return ctx.state.interactions.recent.some((r) => r.id === def.id && r.target === target && ctx.state.day - r.day < days);
}

/** The interactions of the menu of a person, in the order of the content, each with why it cannot be done now. Pure. */
export function interactionAvailability(ctx: Ctx, target: string): InteractionAvailability[] {
  const { state, content } = ctx;
  const interactions = content.interactions;
  if (!interactions) return [];
  const hero = getPlayer(state);
  const scope = { hero: hero.id, protagonist: hero.id, target };
  return interactions.list.map((interaction) => {
    const report = interaction.when ? conditionReport(ctx, hero, interaction.when, scope) : { reasons: [], hidden: false };
    const cooldown = resting(ctx, interaction, target) ? [interactions.reasons.cooldown] : [];
    return { interaction, unmet: [...report.reasons, ...cooldown], hidden: report.hidden };
  });
}

/**
 * Carries out an interaction (CK.2a): the person is alive, near the hero and not the hero; the interaction is shown and
 * its conditions are met. Its effects apply to the hero with the person as the role `target`. No time passes and no
 * randomness is used here (effects may use it). Throws on a command the player could not give.
 */
export function interactCommand(ctx: Ctx, order: InteractOrder): void {
  const { state, content } = ctx;
  if (state.status !== 'awaiting_action' && state.status !== 'running') throw new Error(`Cannot interact while ${state.status}`);
  const hero = getPlayer(state);
  const person = findCharacter(state, order.target);
  if (!person || person.deathDay !== null || person.id === hero.id || !isNear(state, person.id)) throw new Error(`Nobody near the hero to interact with: "${order.target}"`);
  const found = interactionAvailability(ctx, person.id).find((a) => a.interaction.id === order.id);
  if (!found) throw new Error(`Unknown interaction "${order.id}"`);
  if (found.hidden || found.unmet.length > 0) throw new Error(`Interaction "${order.id}" is not available now`);
  const def = found.interaction;
  // records past their cooldown go; this one stays while its own runs
  const list = content.interactions?.list ?? [];
  state.interactions.recent = state.interactions.recent.filter((r) => {
    const days = list.find((x) => x.id === r.id)?.cooldown_days;
    return days !== undefined && state.day - r.day < days;
  });
  if (def.cooldown_days !== undefined) state.interactions.recent.push({ id: def.id, target: person.id, day: state.day });
  applyEffects(ctx, hero, def.effects, { hero: hero.id, protagonist: hero.id, target: person.id });
}
