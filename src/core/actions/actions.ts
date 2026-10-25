import { log } from '../chronicle/log';
import { conditionReport } from '../condition-keys';
import type { Content } from '../content/schema';
import { applyEffects } from '../effects';
import { int } from '../rng';
import { findCharacter, getPlayer, isInt } from '../helpers';
import type { Ctx, DayPhase, DeathHook, Invariant } from '../state';
import { routesFrom } from '../place/place';
import { timeContent } from '../time/seasons';
import type { ActionDef } from './content';

export interface ActionsState {
  /** `target`: the place the road leads to, for an action with `target: place` (S.9a); null for any other. */
  activeAction: { actionId: string; endDay: number; target: string | null } | null;
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
  /** Texts of the visible conditions that are not met. */
  unmet: string[];
  /** Some condition the player must not see is not met: the action is not shown (D-043). */
  hidden: boolean;
}

/** Every action with the reasons it is unavailable now (D-043). Never consumes randomness. */
export function actionAvailability(ctx: Ctx): ActionAvailability[] {
  const { state, content } = ctx;
  const hero = getPlayer(state);
  const scope = { hero: hero.id, protagonist: hero.id };
  return content.actions.map((action) => {
    // An action that goes somewhere needs a road from here (S.9a); the hero knows the roads.
    const noRoad = action.target === 'place' && content.places && routesFrom(state, content).length === 0 ? [content.places.reasons.no_road] : [];
    if (!action.when) return { action, unmet: noRoad, hidden: false };
    const report = conditionReport(ctx, hero, action.when, scope);
    return { action, unmet: [...report.reasons, ...noRoad], hidden: report.hidden };
  });
}

/** Actions the player can start now. Never consumes randomness. */
export function availableActions(ctx: Ctx): ActionDef[] {
  if (ctx.state.status !== 'awaiting_action' && ctx.state.status !== 'running') return [];
  return actionAvailability(ctx).filter((a) => a.unmet.length === 0 && !a.hidden).map((a) => a.action);
}

/**
 * Starts an action; `target` is the place of an action with `target: place` (S.9a): a road must lead there from where the
 * hero stands, and the days of the road are the duration, with no roll. Any other action takes no target.
 */
export function startAction(ctx: Ctx, actionId: string, target: string | null = null): void {
  const { state, content } = ctx;
  if (state.status !== 'awaiting_action' && state.status !== 'running') throw new Error(`Cannot start an action while ${state.status}`);
  const action = findAction(content, actionId);
  if (!availableActions(ctx).includes(action)) throw new Error(`Action "${actionId}" is not available now`);
  // A change of occupation breaks off the one under way: no effects, a journal line (an idle life leaves none).
  // The same action again would only roll its duration anew for free.
  const current = state.activeAction;
  if (current?.actionId === action.id) throw new Error(`Action "${actionId}" is already under way`);
  // The target is checked before anything changes: a refused command leaves no line and no roll.
  let roadDays: number | null = null;
  if (action.target === 'place') {
    if (target === null) throw new Error(`Action "${actionId}" needs a place to go to`);
    const road = routesFrom(state, content).find((r) => r.to === target);
    if (!road) throw new Error(`No road leads from here to "${target}"`);
    roadDays = road.days;
  } else if (target !== null) throw new Error(`Action "${actionId}" takes no target`);
  if (current && !findAction(content, current.actionId).idle) {
    const template = state.interruptRequest?.template ?? timeContent(content).texts.interrupted;
    log(ctx, { subject: getPlayer(state), kind: 'interrupt', level: 'journal', template });
  }
  const duration = roadDays ?? int(state.rng, action.duration.min, action.duration.max);
  state.activeAction = { actionId: action.id, endDay: state.day + duration, target: action.target === 'place' ? target : null };
  state.interruptRequest = null;
}

/**
 * Stops the hero's action before its end: no effects, a journal line, the player chooses
 * anew. The health phase (2.9) calls it and then returns true to end the day.
 */
export function interruptAction(ctx: Ctx, template?: string): void {
  const { state, content } = ctx;
  if (!state.activeAction) return;
  log(ctx, {
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
    const moneyBefore = player.money;
    applyEffects(ctx, player, action.effects, { hero: player.id, protagonist: player.id });
    if (!action.idle) log(ctx, { subject: player, kind: 'action', level: 'chronicle', template: action.text, money: player.money - moneyBefore });
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
    const def = content.actions.find((a) => a.id === active.actionId);
    if (def && (active.target !== null) !== (def.target !== undefined)) problems.push(`active action ${active.actionId}: target ${String(active.target)} does not fit the action`);
  }
  if (state.interruptRequest && !active) problems.push('interrupt requested without an active action');
  // D-017: the player is never left without a move.
  if (state.status === 'awaiting_action' && findCharacter(state, state.playerId) && availableActions(ctx).length === 0) {
    problems.push('no action is available to the player (D-017)');
  }
  return problems;
};
