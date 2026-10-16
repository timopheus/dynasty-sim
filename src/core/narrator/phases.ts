import type { EventDef } from '../events/content';
import { eventWeight, startEvent } from '../events/events';
import { getPlayer } from '../helpers';
import { chancePer, weightedPick } from '../rng';
import type { Ctx, DayPhase } from '../state';
import { narratorContent } from './content';

/** One roll of the hero's deck: the pace first, then a weighted pick among the possible events. */
function rollDeck(ctx: Ctx): EventDef | null {
  const { state, content } = ctx;
  const pace = narratorContent(content);
  if (state.lastEventDay !== null && state.day - state.lastEventDay < pace.minDaysBetweenEvents) return null;
  if (!chancePer(state.rng, pace.eventChancePer10k, 10000)) return null;
  const hero = getPlayer(state);
  const weighted: { event: EventDef; weight: number }[] = [];
  for (const event of content.events) {
    if (Object.hasOwn(state.lastFired, event.id) && state.day - (state.lastFired[event.id] ?? 0) < pace.eventRepeatCooldownDays) continue;
    const weight = eventWeight(ctx, event, hero);
    if (weight > 0) weighted.push({ event, weight });
  }
  if (weighted.length === 0) return null;
  return weightedPick(state.rng, weighted, (w) => w.weight).event;
}

/**
 * The narrator (D-045): during the hero's action rolls the deck; a fired event waits for the player's choice.
 * Last phase of the day, so an event never fires on the day an action ends.
 */
export const narratorPhase: DayPhase = {
  id: 'narrator',
  run(ctx) {
    const { state } = ctx;
    if (!state.activeAction) return false;
    const event = rollDeck(ctx);
    if (!event || !startEvent(ctx, event, getPlayer(state))) return false;
    state.lastFired[event.id] = state.day;
    state.lastEventDay = state.day;
    return true;
  },
};
