import { log } from '../chronicle/log';
import type { Content } from '../content/schema';
import { applyEffects } from '../effects';
import { chancePer, weightedPick } from '../rng';
import { getPlayer } from '../helpers';
import type { Ctx, DayPhase, DeathHook, GameState, Invariant } from '../state';
import type { EventDef } from './content';

export interface EventsState {
  pendingEvent: { eventId: string } | null;
  /** Event id -> day it last fired. */
  lastFired: Record<string, number>;
  lastEventDay: number | null;
}

export function initEventsState(): EventsState {
  return { pendingEvent: null, lastFired: {}, lastEventDay: null };
}

export function findEvent(content: Content, id: string): EventDef {
  const event = content.events.find((e) => e.id === id);
  if (!event) throw new Error(`Unknown event "${id}"`);
  return event;
}

export function pendingEventDef(state: GameState, content: Content): EventDef | null {
  return state.pendingEvent ? findEvent(content, state.pendingEvent.eventId) : null;
}

/** Applies the chosen option of the pending event. */
export function chooseOption(ctx: Ctx, index: number): void {
  const { state, content } = ctx;
  if (state.status !== 'awaiting_choice' || !state.pendingEvent) {
    throw new Error(`Cannot choose an option while ${state.status}`);
  }
  const event = findEvent(content, state.pendingEvent.eventId);
  const option = event.options[index];
  if (!Number.isInteger(index) || !option) throw new Error(`Event "${event.id}" has no option ${index}`);
  const player = getPlayer(state);
  applyEffects(ctx, player, option.effects);
  log(state, { subject: player, kind: 'event', level: 'chronicle', template: option.result });
  state.pendingEvent = null;
}

function rollEvent({ state, content }: Ctx, actionId: string): EventDef | null {
  const { settings } = content;
  if (state.lastEventDay !== null && state.day - state.lastEventDay < settings.minDaysBetweenEvents) return null;
  if (!chancePer(state.rng, settings.eventChancePer10k, 10000)) return null;
  const candidates = content.events.filter((e) => {
    if (e.actions && !e.actions.includes(actionId)) return false;
    if (!Object.hasOwn(state.lastFired, e.id)) return true;
    return state.day - (state.lastFired[e.id] ?? 0) >= settings.eventRepeatCooldownDays;
  });
  if (candidates.length === 0) return null;
  return weightedPick(state.rng, candidates, (e) => e.weight);
}

/** Rolls for an event during the hero's action; a fired event waits for the player's choice. */
export const eventPhase: DayPhase = {
  id: 'event',
  run(ctx) {
    const { state } = ctx;
    if (!state.activeAction) return false;
    const event = rollEvent(ctx, state.activeAction.actionId);
    if (!event) return false;
    state.pendingEvent = { eventId: event.id };
    state.lastFired[event.id] = state.day;
    state.lastEventDay = state.day;
    state.status = 'awaiting_choice';
    return true;
  },
};

/** The hero's death drops an unanswered event. */
export const eventsOnDeath: DeathHook = ({ state }, c) => {
  if (c.id === state.playerId) state.pendingEvent = null;
};

export const eventsInvariants: Invariant = ({ state, content }) => {
  const pending = state.pendingEvent;
  if (pending && !content.events.some((e) => e.id === pending.eventId)) return [`unknown pending event ${pending.eventId}`];
  return [];
};
