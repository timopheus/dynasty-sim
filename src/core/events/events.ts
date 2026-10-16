import { log } from '../chronicle/log';
import type { Content } from '../content/schema';
import { applyEffects } from '../effects';
import { findCharacter, getPlayer } from '../helpers';
import { baseScope, canFillRoles, fillRoles } from '../roles/roles';
import type { Character, Ctx, DeathHook, GameState, Invariant, Scope } from '../state';
import { renderTemplate } from '../text/render';
import type { EventDef } from './content';

/** An event waiting for the player's choice: the main participant and the scope of roles it started with. */
export interface PendingEvent {
  eventId: string;
  /** Id of the main participant; the hero in hero events. */
  protagonist: string;
  scope: Scope;
}

export interface EventsState {
  pendingEvent: PendingEvent | null;
}

export function initEventsState(): EventsState {
  return { pendingEvent: null };
}

export function findEvent(content: Content, id: string): EventDef {
  const event = content.events.find((e) => e.id === id);
  if (!event) throw new Error(`Unknown event "${id}"`);
  return event;
}

export function pendingEventDef(state: GameState, content: Content): EventDef | null {
  return state.pendingEvent ? findEvent(content, state.pendingEvent.eventId) : null;
}

/**
 * Weight of the event for the main participant now; 0 means impossible (3.2 adds `when`, `weight_mods`). Rules of
 * 3.1, as before: bound to an action, the event needs the hero to be doing it; every role must be fillable. Pure.
 */
export function eventWeight(ctx: Ctx, event: EventDef, protagonist: Character): number {
  const { state } = ctx;
  if (event.actions) {
    const active = state.activeAction;
    if (!active || !event.actions.includes(active.actionId)) return 0;
  }
  if (event.roles && !canFillRoles(ctx, event.roles, baseScope(getPlayer(state), protagonist))) return 0;
  return event.weight;
}

/**
 * Starts the event: fills the roles on top of `given` (roles handed over by a follow-up) and waits for the choice.
 * Returns false, changing nothing, if a role cannot be filled.
 */
export function startEvent(ctx: Ctx, event: EventDef, protagonist: Character, given: Scope = {}): boolean {
  const { state } = ctx;
  const scope = fillRoles(ctx, event.roles, { ...given, ...baseScope(getPlayer(state), protagonist) });
  if (!scope) return false;
  state.pendingEvent = { eventId: event.id, protagonist: protagonist.id, scope };
  state.status = 'awaiting_choice';
  return true;
}

/** Applies the chosen option of the pending event. */
export function chooseOption(ctx: Ctx, index: number): void {
  const { state, content } = ctx;
  const pending = state.pendingEvent;
  if (state.status !== 'awaiting_choice' || !pending) {
    throw new Error(`Cannot choose an option while ${state.status}`);
  }
  const event = findEvent(content, pending.eventId);
  const option = event.options[index];
  if (!Number.isInteger(index) || !option) throw new Error(`Event "${event.id}" has no option ${index}`);
  const protagonist = findCharacter(state, pending.protagonist);
  if (!protagonist) throw new Error(`Unknown main participant ${pending.protagonist}`);
  const moneyBefore = protagonist.money;
  applyEffects(ctx, protagonist, option.effects, pending.scope);
  const parts = renderTemplate(ctx, option.result, pending.scope, 0, `option.${index}.result`);
  log(ctx, { subject: protagonist, kind: 'event', level: 'chronicle', parts, money: protagonist.money - moneyBefore, mark: option.mark });
  state.pendingEvent = null;
}

/** The hero's death drops an unanswered event. */
export const eventsOnDeath: DeathHook = ({ state }, c) => {
  if (c.id === state.playerId) state.pendingEvent = null;
};

export const eventsInvariants: Invariant = ({ state, content }) => {
  const pending = state.pendingEvent;
  if (!pending) return [];
  const problems: string[] = [];
  if (!content.events.some((e) => e.id === pending.eventId)) problems.push(`unknown pending event ${pending.eventId}`);
  if (pending.scope.protagonist !== pending.protagonist) problems.push(`pending event ${pending.eventId}: protagonist is not in the scope`);
  for (const [role, id] of Object.entries(pending.scope)) {
    if (!findCharacter(state, id)) problems.push(`pending event ${pending.eventId}: role ${role} is unknown character ${id}`);
  }
  return problems;
};
