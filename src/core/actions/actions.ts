import { EARLY_YEARS, inChildhood } from '../backstory/backstory';
import { log } from '../chronicle/log';
import { conditionReport } from '../condition-keys';
import { contractPlan, contractReasons, takeContract } from '../contracts/contracts';
import type { Content } from '../content/schema';
import { applyEffects } from '../effects';
import { int } from '../rng';
import { findCharacter, getPlayer, isInt } from '../helpers';
import type { Ctx, DayPhase, DeathHook, Invariant } from '../state';
import { hasRoadFrom, routesFrom, stopJourney } from '../place/place';
import { timeContent } from '../time/seasons';
import type { ActionDef } from './content';

export interface ActionsState {
  /**
   * `target`: the place a journey leads to — of an action with `target: place` (S.9a, D-462), or of one with
   * `target: contract` whose work is elsewhere; null for any other. `contract`: the hero's contract the action serves
   * (CK.2a), only for an action with `target: contract`; null for any other.
   */
  activeAction: { actionId: string; endDay: number; target: string | null; contract: string | null } | null;
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
  const childhood = inChildhood(ctx);
  return content.actions.map((action) => {
    // An action that goes somewhere needs a road from here (S.9a); the hero knows the roads.
    const noRoad = action.target === 'place' && content.places && !hasRoadFrom(state, content) ? [content.places.reasons.no_road] : [];
    // An action that serves a contract needs an offer on the board here and no work under way (CK.2a).
    const noWork = action.target === 'contract' ? contractReasons(state, content) : [];
    // the founder's childhood (D-479, T.3): no occupation of his own until he goes out into the world
    if (childhood) return { action, unmet: ['childhood'], hidden: true };
    if (!action.when) return { action, unmet: [...noRoad, ...noWork], hidden: false };
    const report = conditionReport(ctx, hero, action.when, scope);
    return { action, unmet: [...report.reasons, ...noRoad, ...noWork], hidden: report.hidden };
  });
}

/** Actions the player can start now. Never consumes randomness. */
export function availableActions(ctx: Ctx): ActionDef[] {
  if (ctx.state.status !== 'awaiting_action' && ctx.state.status !== 'running') return [];
  return actionAvailability(ctx).filter((a) => a.unmet.length === 0 && !a.hidden).map((a) => a.action);
}

/**
 * Starts an action; `target` is the place of an action with `target: place` (S.9a, D-462): any place but the one the hero
 * stands in, by the shortest way from where he is now; its days are the duration, with no roll. For an action with
 * `target: contract` (CK.2a) it is an offer on the board where the hero stands: he takes it, and the action lasts its
 * days of work, or is a journey to the place of the work. Any other action takes no target. A journey under way may be
 * turned toward another place; any other change of occupation stops it where the hero is (`stopJourney`).
 */
export function startAction(ctx: Ctx, actionId: string, target: string | null = null): void {
  const { state, content } = ctx;
  if (state.status !== 'awaiting_action' && state.status !== 'running') throw new Error(`Cannot start an action while ${state.status}`);
  const action = findAction(content, actionId);
  if (!availableActions(ctx).includes(action)) throw new Error(`Action "${actionId}" is not available now`);
  // A change of occupation breaks off the one under way: no effects, a journal line (an idle life leaves none).
  // The same action again would only roll its duration anew for free.
  const current = state.activeAction;
  const retarget = action.target === 'place' && target !== null && current?.target !== target;
  if (current?.actionId === action.id && !retarget) throw new Error(`Action "${actionId}" is already under way`);
  // The target is checked before anything changes: a refused command leaves no line and no roll.
  let roadDays: number | null = null;
  let journeyTo: string | null = null;
  if (action.target === 'place') {
    if (target === null) throw new Error(`Action "${actionId}" needs a place to go to`);
    const way = routesFrom(state, content).find((r) => r.to === target);
    if (!way) throw new Error(`No way leads from here to "${target}"`);
    roadDays = way.days;
    journeyTo = target;
  } else if (action.target === 'contract') {
    if (target === null) throw new Error(`Action "${actionId}" needs an offer to take`);
    const plan = contractPlan(state, content, target);
    roadDays = plan.days;
    journeyTo = plan.to;
  } else if (target !== null) throw new Error(`Action "${actionId}" takes no target`);
  // A turn on the road has its own line (S.9: the journal of the place), not the line of a break.
  const turning = retarget && current?.actionId === action.id;
  if (current && !turning && !findAction(content, current.actionId).idle) {
    const template = state.interruptRequest?.template ?? timeContent(content).texts.interrupted;
    log(ctx, { subject: getPlayer(state), kind: 'interrupt', level: 'journal', template });
  }
  const duration = roadDays ?? int(state.rng, action.duration.min, action.duration.max);
  stopJourney(ctx, turning && target !== null ? { turn: target } : 'stopped');
  const contract = action.target === 'contract' && target !== null ? takeContract(state, target).id : null;
  state.activeAction = { actionId: action.id, endDay: state.day + duration, target: journeyTo, contract };
  state.interruptRequest = null;
}

/**
 * The founder's childhood (D-479, T.3): an occupation of his own that ended or was broken off gives way to the early
 * years again, until the next scene (at the earliest tomorrow: a scene put off today comes then). True if it did.
 */
function resumeEarlyYears(ctx: Ctx): boolean {
  const { state } = ctx;
  const next = state.backstory.next;
  if (!inChildhood(ctx) || next === null || state.activeAction !== null || state.pendingEvent) return false;
  state.activeAction = { actionId: EARLY_YEARS, endDay: Math.max(next, state.day + 1), target: null, contract: null };
  state.status = 'running';
  return true;
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
  stopJourney(ctx, 'stopped');
  state.activeAction = null;
  state.pendingEvent = null;
  state.interruptRequest = null;
  state.status = 'awaiting_action';
  resumeEarlyYears(ctx);
}

/**
 * Completes the action on its end day, or earlier when its goal is reached (`until`, D-466): effects, chronicle line,
 * back to the player.
 */
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
    const action = findAction(content, active.actionId);
    const player = getPlayer(state);
    const scope = { hero: player.id, protagonist: player.id };
    const goal = state.day < active.endDay && action.until !== undefined && conditionReport(ctx, player, action.until.when, scope).met;
    if (state.day < active.endDay && !goal) return false;
    const moneyBefore = player.money;
    applyEffects(ctx, player, action.effects, scope);
    const text = goal && action.until?.text !== undefined ? action.until.text : action.text;
    // the line of a journey is the arrival in the journal (S.9): the place is named there; a goal reached on the way has its own line
    if (!action.idle && (action.target === undefined || goal) && text !== null) log(ctx, { subject: player, kind: 'action', level: 'chronicle', template: text, money: player.money - moneyBefore });
    // a journey whose goal is reached on the way ends there, not back where it set out (D-462)
    if (goal) stopJourney(ctx);
    state.activeAction = null;
    state.interruptRequest = null;
    state.status = 'awaiting_action';
    // in the founder's childhood the early years go on by themselves: the day goes on too
    return !resumeEarlyYears(ctx);
  },
};

/** The hero's death ends the action; a journey stops where he died, and the heir is there (D-462). */
export const actionsOnDeath: DeathHook = (ctx, c) => {
  const { state } = ctx;
  if (c.id === state.playerId) {
    stopJourney(ctx);
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
    // a journey has its place, a contract its record; work on a contract may be a journey too (CK.2a)
    if (def && def.target !== 'contract' && (active.target !== null) !== (def.target === 'place')) problems.push(`active action ${active.actionId}: target ${String(active.target)} does not fit the action`);
    if (def && (active.contract !== null) !== (def.target === 'contract')) problems.push(`active action ${active.actionId}: contract ${String(active.contract)} does not fit the action`);
  }
  if (state.interruptRequest && !active) problems.push('interrupt requested without an active action');
  // D-017: the player is never left without a move.
  if (state.status === 'awaiting_action' && findCharacter(state, state.playerId) && availableActions(ctx).length === 0) {
    problems.push('no action is available to the player (D-017)');
  }
  return problems;
};
