import { log } from '../chronicle/log';
import { unmetConditions } from '../condition-keys';
import type { Content } from '../content/schema';
import { applyEffects } from '../effects';
import { int } from '../rng';
import { findCharacter, getPlayer, isInt } from '../helpers';
import type { Ctx, DayPhase, DeathHook, Invariant } from '../state';
import { timeContent } from '../time/seasons';
import type { ActionDef } from './content';

export interface ActionsState {
  activeAction: { actionId: string; endDay: number } | null;
  /**
   * Set by the `end_action` effect; the action-end phase interrupts the action.
   * `template` null means the default line of `time.texts.interrupted`.
   */
  interruptRequest: { template: string | null } | null;
}

export function initActionsState(): ActionsState {
  return { activeAction: null, interruptRequest: null };
}

export function findAction(content: Content, id: string): ActionDef {
  const action = content.actions.find((a) => a.id === id);
  if (!action) throw new Error(`Unknown action "${id}"`);
  return action;
}

export interface ActionAvailability {
  action: ActionDef;
  /** Texts of the conditions that are not met; empty means the action can be started. */
  unmet: string[];
}

/** Every action with the reasons it is unavailable now (D-043). Never consumes randomness. */
export function actionAvailability(ctx: Ctx): ActionAvailability[] {
  const { state, content } = ctx;
  const hero = getPlayer(state);
  return content.actions.map((action) => ({ action, unmet: action.when ? unmetConditions(ctx, hero, action.when) : [] }));
}

/** Actions the player can start now. Never consumes randomness. */
export function availableActions(ctx: Ctx): ActionDef[] {
  if (ctx.state.status !== 'awaiting_action') return [];
  return actionAvailability(ctx).filter((a) => a.unmet.length === 0).map((a) => a.action);
}

export function startAction(ctx: Ctx, actionId: string): void {
  const { state, content } = ctx;
  if (state.status !== 'awaiting_action') throw new Error(`Cannot start an action while ${state.status}`);
  const action = findAction(content, actionId);
  if (!availableActions(ctx).includes(action)) throw new Error(`Action "${actionId}" is not available now`);
  const duration = int(state.rng, action.duration.min, action.duration.max);
  state.activeAction = { actionId: action.id, endDay: state.day + duration };
  state.interruptRequest = null;
}

/**
 * Stops the hero's action before its end: no effects, a journal line, the player chooses
 * anew. The health phase (2.9) calls it and then returns true to end the day.
 */
export function interruptAction(ctx: Ctx, template?: string): void {
  const { state, content } = ctx;
  if (!state.activeAction) return;
  log(state, {
    subject: getPlayer(state),
    kind: 'interrupt',
    level: 'journal',
    template: template ?? timeContent(content).texts.interrupted,
  });
  state.activeAction = null;
  state.pendingEvent = null;
  state.interruptRequest = null;
  state.status = 'awaiting_action';
}

/** Completes the action on its end day: effects, chronicle line, back to the player. */
export const actionEndPhase: DayPhase = {
  id: 'action_end',
  run(ctx) {
    const { state, content } = ctx;
    const active = state.activeAction;
    if (!active) return false;
    if (state.interruptRequest) {
      interruptAction(ctx, state.interruptRequest.template ?? undefined);
      return true;
    }
    if (state.day < active.endDay) return false;
    const action = findAction(content, active.actionId);
    const player = getPlayer(state);
    applyEffects(ctx, player, action.effects);
    log(state, { subject: player, kind: 'action', level: 'chronicle', template: action.text });
    state.activeAction = null;
    state.interruptRequest = null;
    state.status = 'awaiting_action';
    return true;
  },
};

/** The hero's death ends the action. */
export const actionsOnDeath: DeathHook = ({ state }, c) => {
  if (c.id === state.playerId) {
    state.activeAction = null;
    state.interruptRequest = null;
  }
};

export const actionsInvariants: Invariant = (ctx) => {
  const { state, content } = ctx;
  const problems: string[] = [];
  const active = state.activeAction;
  if (active) {
    if (!content.actions.some((a) => a.id === active.actionId)) problems.push(`unknown active action ${active.actionId}`);
    if (!isInt(active.endDay) || active.endDay <= state.day) {
      problems.push(`active action ends on day ${active.endDay}, not after ${state.day}`);
    }
  }
  if (state.interruptRequest && !active) problems.push('interrupt requested without an active action');
  // D-017: the player is never left without a move.
  if (state.status === 'awaiting_action' && findCharacter(state, state.playerId) && availableActions(ctx).length === 0) {
    problems.push('no action is available to the player (D-017)');
  }
  return problems;
};
