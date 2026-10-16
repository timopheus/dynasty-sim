import { log, type ChronicleEntry } from '../chronicle/log';
import { conditionReport } from '../condition-keys';
import type { Content } from '../content/schema';
import { factorParts } from '../content/types';
import { applyEffects, type Effects } from '../effects';
import { findCharacter, getPlayer } from '../helpers';
import { introduce } from '../relations/acquaintance';
import { anyCandidate, baseScope, canFillRoles, fillRoles } from '../roles/roles';
import type { Character, Ctx, DeathHook, GameState, Invariant, RefsFn, Scope } from '../state';
import { renderTemplate } from '../text/render';
import type { TextPart } from '../text/text';
import { rollCheck } from './checks';
import { onForNpc, withoutHeroEffects } from './hero-effects';
import { ownOutcome, sceneOf, scenePath, type EventDef, type OptionDef, type OutcomeDef, type SceneDef } from './content';

/**
 * The event under way (D-040, D-172): the main participant, the scope of roles it started with, its number for the
 * grammar, the page shown and what the pages before have gathered for the one chronicle entry of the event.
 */
export interface PendingEvent {
  eventId: string;
  /** Id of the main participant; the hero in hero events. */
  protagonist: string;
  scope: Scope;
  /** Number of the event in the game (`seq` of the grammar, 3.4). */
  seq: number;
  /** Page shown; null is the event's own first scene. */
  page: string | null;
  /** Lines of the outcomes chosen on earlier pages, glued into one entry when the event ends. */
  lines: TextPart[][];
  /** Change of the main participant's money over the pages, for selection by sum (D-130). */
  money: number;
  /** Some choice so far deserves a ▸ (D-040). */
  mark: boolean;
  /** Some outcome so far has `chronicle: true`. */
  important: boolean;
  /**
   * Entries the effects of the outcomes wrote about the hero and the participants (a tie, a changed trait): they wait
   * here and go to the chronicle right after the line of the event (D-176). Level fixed at the moment of the effect.
   */
  after: ChronicleEntry[];
}

export interface EventsState {
  pendingEvent: PendingEvent | null;
  /** Number the next event gets. */
  eventSeq: number;
}

export function initEventsState(): EventsState {
  return { pendingEvent: null, eventSeq: 0 };
}

export function findEvent(content: Content, id: string): EventDef {
  const event = content.events.find((e) => e.id === id);
  if (!event) throw new Error(`Unknown event "${id}"`);
  return event;
}

/** The pending event's definition; its current scene is `currentScene`. */
export function pendingEventDef(state: GameState, content: Content): EventDef | null {
  return state.pendingEvent ? findEvent(content, state.pendingEvent.eventId) : null;
}

/** The scene the pending event shows now: the event itself or a page. */
export function currentScene(state: GameState, content: Content): SceneDef | null {
  const pending = state.pendingEvent;
  return pending ? sceneOf(findEvent(content, pending.eventId), pending.page) : null;
}

function met(ctx: Ctx, c: Character, when: Parameters<typeof conditionReport>[2] | undefined, scope: Scope): boolean {
  return !when || conditionReport(ctx, c, when, scope).met;
}

/**
 * Weight of the event for the main participant now; 0 means impossible. Bound to an action, the event needs the hero
 * to be doing it; `when` holds for the main participant; every role can be filled; then the factors of `weight_mods`
 * whose conditions hold (by role: some candidate of the role meets them, D-161) multiply the weight, rounded down
 * once at the end (D-040). Pure: never consumes randomness.
 */
export function eventWeight(ctx: Ctx, event: EventDef, protagonist: Character, given: Scope = {}): number {
  const { state } = ctx;
  if (event.actions) {
    const active = state.activeAction;
    if (!active || !event.actions.includes(active.actionId)) return 0;
  }
  const base = baseScope(getPlayer(state), protagonist);
  if (!met(ctx, protagonist, event.when, base)) return 0;
  // People handed over (roles `pick: given`, D-178) count for filling the roles, not for the conditions of the weight.
  if (event.roles && !canFillRoles(ctx, event.roles, { ...given, ...base })) return 0;
  let num = event.weight;
  let den = 1;
  for (const mod of event.weight_mods ?? []) {
    const role = mod.role === undefined ? undefined : event.roles?.[mod.role];
    const holds = mod.role === undefined ? met(ctx, protagonist, mod.when, base) : role !== undefined && anyCandidate(ctx, mod.role, role, mod.when, base);
    if (!holds) continue;
    const f = factorParts(mod.factor);
    num *= f.num;
    den *= f.den;
  }
  return Math.floor(num / den);
}

/** What firing an event led to: it waits for the player, it was carried out at once (a quiet notice), or not fired. */
export type FireResult = 'waiting' | 'done' | 'failed';

/**
 * Fires the event: fills the roles on top of `given` (roles handed over by a follow-up), gives it a number, makes the
 * participants known to the hero (D-041) and shows the first scene. A notice without a chronicle line and without `next` is carried out
 * at once and nothing waits (D-045). 'failed' changes nothing: a role could not be filled.
 */
export function fireEvent(ctx: Ctx, event: EventDef, protagonist: Character, given: Scope = {}): FireResult {
  const { state } = ctx;
  const pending = openEvent(ctx, event, protagonist, given);
  if (!pending) return 'failed';
  if (!event.options && event.chronicle !== true && event.mark !== true && event.next === undefined) {
    // A quiet notice: its line goes to the journal and time runs on.
    resolveOutcome(ctx, event, pending, ownOutcome(event), '', false);
    if (!state.pendingEvent) return 'done';
  }
  state.status = 'awaiting_choice';
  return 'waiting';
}

/**
 * Fills the roles, gives the event its number, makes the participants known to the hero when it is the hero's event
 * and puts it under way. Null, with nothing changed, if a role could not be filled.
 */
export function openEvent(ctx: Ctx, event: EventDef, protagonist: Character, given: Scope = {}): PendingEvent | null {
  const { state } = ctx;
  const scope = fillRoles(ctx, event.roles, { ...given, ...baseScope(getPlayer(state), protagonist) });
  if (!scope) return null;
  const pending: PendingEvent = { eventId: event.id, protagonist: protagonist.id, scope, seq: state.eventSeq, page: null, lines: [], money: 0, mark: false, important: false, after: [] };
  state.eventSeq += 1;
  if (protagonist.id === state.playerId) {
    for (const [role, id] of Object.entries(scope)) if (role !== 'hero' && role !== 'protagonist' && id !== state.playerId) introduce(ctx, id);
  }
  state.pendingEvent = pending;
  return pending;
}

/**
 * The contract of D-172: fires the event and returns true if it now waits for the player. False if a role could not
 * be filled (nothing changed) or the event was a quiet notice, carried out at once (see `fireEvent`).
 */
export function startEvent(ctx: Ctx, event: EventDef, protagonist: Character, given: Scope = {}): boolean {
  return fireEvent(ctx, event, protagonist, given) === 'waiting';
}

/** Effect keys that put ▸ on the hero's choice by themselves (D-040); the list grows with stages 4–6. */
export const AUTO_MARK_KEYS = ['relation', 'schedule', 'story'] as const;

function marksItself(effects: Effects | undefined): boolean {
  if (!effects) return false;
  if (AUTO_MARK_KEYS.some((key) => Object.hasOwn(effects, key))) return true;
  return (effects.later ?? []).some((entry) => marksItself(entry.effects as Effects));
}

/** The outcome sets ▸ by itself: one of its blocks has a key of AUTO_MARK_KEYS. */
export function autoMark(outcome: OutcomeDef): boolean {
  return marksItself(outcome.effects as Effects | undefined) || Object.values(outcome.on ?? {}).some((e) => marksItself(e as Effects));
}

/** Lines of the pages, glued with a space into one text. */
function glue(lines: TextPart[][]): TextPart[] {
  const out: TextPart[] = [];
  for (const [i, line] of lines.entries()) {
    for (const part of i > 0 ? [' ', ...line] : line) {
      const last = out.at(-1);
      if (typeof part === 'string' && typeof last === 'string') out[out.length - 1] = last + part;
      else out.push(part);
    }
  }
  return out;
}

/**
 * Applies an outcome: effects on the main participant and on the roles (an empty optional role is skipped), its line
 * to the gathered ones, then the next page or the end of the event with one entry for all pages. `choice` is true
 * for the player's choice among options: only that gets the automatic ▸.
 */
export function resolveOutcome(ctx: Ctx, event: EventDef, pending: PendingEvent, outcome: OutcomeDef, slot: string, choice: boolean): void {
  const { state } = ctx;
  const protagonist = findCharacter(state, pending.protagonist);
  if (!protagonist) throw new Error(`Unknown main participant ${pending.protagonist}`);
  const moneyBefore = protagonist.money;
  // An event that fell to a person of the world does not change the hero (D-174).
  const npc = protagonist.id !== state.playerId;
  applyEffects(ctx, protagonist, npc && outcome.effects ? withoutHeroEffects(outcome.effects as Effects) : outcome.effects, pending.scope);
  const blocks = npc ? onForNpc(outcome.on as Record<string, Effects> | undefined) : Object.entries(outcome.on ?? {});
  for (const [role, effects] of blocks) {
    const id = pending.scope[role];
    const person = id === undefined ? null : findCharacter(state, id);
    if (person) applyEffects(ctx, person, effects, pending.scope);
  }
  pending.money += protagonist.money - moneyBefore;
  if (outcome.result !== undefined) pending.lines.push(renderTemplate(ctx, outcome.result, pending.scope, pending.seq, `${slot}result`, event.grammar ?? null));
  if (outcome.mark === true || (choice && protagonist.id === state.playerId && autoMark(outcome))) pending.mark = true;
  if (outcome.chronicle === true) pending.important = true;
  if (outcome.next !== undefined) {
    pending.page = outcome.next;
    return;
  }
  state.pendingEvent = null;
  if (pending.lines.length > 0) {
    // A notice is an event without any choice: no options and no pages to choose on.
    const notice = !event.options && !event.pages;
    const entry = log(ctx, {
      subject: protagonist,
      // The line of a person of the world is stored only with `chronicle: true` (D-166, chronicle/log.ts).
      kind: npc ? 'npc_event' : notice ? 'notice' : 'event',
      level: !npc && (!notice || pending.important || pending.mark) ? 'chronicle' : 'journal',
      parts: glue(pending.lines),
      money: pending.money,
      mark: !npc && pending.mark,
      important: pending.important,
    });
    if (npc && entry) state.narratorStats.npcStored += 1;
  }
  if (npc) state.narratorStats.npcEvents += 1;
  flushAfter(state, pending);
}

/** The entries the effects wrote during the event go to the chronicle, after the line of the event (D-176). */
function flushAfter(state: GameState, pending: PendingEvent): void {
  state.chronicle.push(...pending.after);
  pending.after = [];
}

/** Whether an option can be chosen now, and whether the player may see it at all (D-043). */
export function optionState(ctx: Ctx, option: OptionDef, protagonist: Character, scope: Scope): { available: boolean; hidden: boolean; reasons: string[] } {
  // A check of an empty optional role hides the option, like a condition naming an empty role (D-193, D-221).
  if (option.check?.of !== undefined && scope[option.check.of] === undefined) return { available: false, hidden: true, reasons: [] };
  if (!option.when) return { available: true, hidden: false, reasons: [] };
  const report = conditionReport(ctx, protagonist, option.when, scope);
  return { available: report.met, hidden: report.hidden, reasons: report.reasons };
}

/**
 * Answers the pending event: option `index` of the scene shown, or 0 ("Continue") on a notice. Throws on an option
 * that is unknown or not available. A check rolls from the world's stream; the outcome may lead to the next page.
 */
export function chooseOption(ctx: Ctx, index: number): void {
  const { state, content } = ctx;
  const pending = state.pendingEvent;
  if (state.status !== 'awaiting_choice' || !pending) {
    throw new Error(`Cannot choose an option while ${state.status}`);
  }
  const event = findEvent(content, pending.eventId);
  const scene = sceneOf(event, pending.page);
  const path = scenePath(pending.page);
  const protagonist = findCharacter(state, pending.protagonist);
  if (!protagonist) throw new Error(`Unknown main participant ${pending.protagonist}`);
  if (!scene.options) {
    if (index !== 0) throw new Error(`Event "${event.id}" shows a notice: the only answer is 0`);
    resolveOutcome(ctx, event, pending, ownOutcome(scene), path, false);
    return;
  }
  const option = scene.options[index];
  if (!Number.isInteger(index) || !option) throw new Error(`Event "${event.id}" has no option ${index}`);
  if (!optionState(ctx, option, protagonist, pending.scope).available) throw new Error(`Option ${index} of event "${event.id}" is not available`);
  answerOption(ctx, event, pending, option, `${path}options.${index}.`, protagonist);
}

/** Carries out the chosen option: rolls its check, if any, and resolves the outcome. */
export function answerOption(ctx: Ctx, event: EventDef, pending: PendingEvent, option: OptionDef, slot: string, protagonist: Character): void {
  const choice = protagonist.id === ctx.state.playerId;
  if (option.check) {
    const success = rollCheck(ctx, option.check, protagonist, pending.scope);
    const key = success ? 'success' : 'failure';
    resolveOutcome(ctx, event, pending, option[key] ?? {}, `${slot}${key}.`, choice);
  } else {
    resolveOutcome(ctx, event, pending, ownOutcome(option), slot, choice);
  }
}

/** The hero's death drops an unanswered event. */
/**
 * People the waiting event refers to (D-312): the main participant, its scope of roles and the people named in the
 * lines that wait for the end of the event.
 */
export const eventsRefs: RefsFn = ({ state }) => {
  const pending = state.pendingEvent;
  if (!pending) return [];
  const linked = (parts: readonly TextPart[]) => parts.flatMap((p) => (typeof p === 'string' ? [] : [p.id]));
  return [
    pending.protagonist,
    ...Object.values(pending.scope),
    ...pending.lines.flatMap(linked),
    ...pending.after.flatMap((e) => [e.subject, ...linked(e.parts)]),
  ];
};

export const eventsOnDeath: DeathHook = ({ state }, c) => {
  if (c.id !== state.playerId || !state.pendingEvent) return;
  flushAfter(state, state.pendingEvent);
  state.pendingEvent = null;
};

export const eventsInvariants: Invariant = (ctx) => {
  const { state, content } = ctx;
  const problems: string[] = [];
  if (!Number.isInteger(state.eventSeq) || state.eventSeq < 0) problems.push(`event counter is ${String(state.eventSeq)}`);
  const pending = state.pendingEvent;
  if (!pending) return problems;
  const event = content.events.find((e) => e.id === pending.eventId);
  if (!event) return [...problems, `unknown pending event ${pending.eventId}`];
  const at = `pending event ${pending.eventId}`;
  if (pending.scope.protagonist !== pending.protagonist) problems.push(`${at}: protagonist is not in the scope`);
  for (const [role, id] of Object.entries(pending.scope)) {
    if (!findCharacter(state, id)) problems.push(`${at}: role ${role} is unknown character ${id}`);
  }
  if (!Number.isInteger(pending.seq) || pending.seq < 0 || pending.seq >= state.eventSeq) problems.push(`${at}: number ${pending.seq} was never given`);
  if (!Number.isInteger(pending.money)) problems.push(`${at}: money ${pending.money} is not an integer`);
  for (const entry of pending.after) {
    if (!findCharacter(state, entry.subject)) problems.push(`${at}: waiting entry is about unknown character ${entry.subject}`);
  }
  for (const line of pending.lines) {
    for (const part of line) if (typeof part !== 'string' && !findCharacter(state, part.id)) problems.push(`${at}: line links to unknown character ${part.id}`);
  }
  if (pending.page !== null && !event.pages?.[pending.page]) return [...problems, `${at}: unknown page ${pending.page}`];
  const protagonist = findCharacter(state, pending.protagonist);
  const scene = sceneOf(event, pending.page);
  if (protagonist && scene.options && !scene.options.some((o) => optionState(ctx, o, protagonist, pending.scope).available)) {
    problems.push(`${at}: no option is available`);
  }
  return problems;
};
