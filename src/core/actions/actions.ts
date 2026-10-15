import { log } from '../chronicle/log';
import type { Content } from '../content/schema';
import { applyEffects } from '../effects';
import { int } from '../rng';
import { getPlayer, isInt } from '../helpers';
import type { Ctx, DayPhase, DeathHook, Invariant } from '../state';
import type { ActionDef } from './content';

export interface ActionsState {
  activeAction: { actionId: string; endDay: number } | null;
}

export function initActionsState(): ActionsState {
  return { activeAction: null };
}

export function findAction(content: Content, id: string): ActionDef {
  const action = content.actions.find((a) => a.id === id);
  if (!action) throw new Error(`Unknown action "${id}"`);
  return action;
}

/** Actions the player can start now. Never consumes randomness. */
export function availableActions({ state, content }: Ctx): ActionDef[] {
  return state.status === 'awaiting_action' ? content.actions : [];
}

export function startAction({ state, content }: Ctx, actionId: string): void {
  if (state.status !== 'awaiting_action') throw new Error(`Cannot start an action while ${state.status}`);
  const action = findAction(content, actionId);
  const duration = int(state.rng, action.duration.min, action.duration.max);
  state.activeAction = { actionId: action.id, endDay: state.day + duration };
}

/**
 * Stops the hero's action before its end: no effects, the player chooses anew.
 * 2.2 adds the journal line; 2.9 calls it from the health phase, which then returns true.
 */
export function interruptAction({ state }: Ctx): void {
  state.activeAction = null;
  state.pendingEvent = null;
  state.status = 'awaiting_action';
}

/** Completes the action on its end day: effects, chronicle line, back to the player. */
export const actionEndPhase: DayPhase = {
  id: 'action_end',
  run(ctx) {
    const { state, content } = ctx;
    const active = state.activeAction;
    if (!active || state.day < active.endDay) return false;
    const action = findAction(content, active.actionId);
    const player = getPlayer(state);
    applyEffects(ctx, player, action.effects);
    log(state, { subject: player, kind: 'action', level: 'chronicle', template: action.text });
    state.activeAction = null;
    state.status = 'awaiting_action';
    return true;
  },
};

/** The hero's death ends the action. */
export const actionsOnDeath: DeathHook = ({ state }, c) => {
  if (c.id === state.playerId) state.activeAction = null;
};

export const actionsInvariants: Invariant = ({ state, content }) => {
  const problems: string[] = [];
  const active = state.activeAction;
  if (active) {
    if (!content.actions.some((a) => a.id === active.actionId)) problems.push(`unknown active action ${active.actionId}`);
    if (!isInt(active.endDay) || active.endDay <= state.day) {
      problems.push(`active action ends on day ${active.endDay}, not after ${state.day}`);
    }
  }
  return problems;
};
