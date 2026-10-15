import { birthDayRange, formatDate } from './calendar';
import {
  applyEffects,
  dailyDeathChance,
  DAILY_DEATH_DENOMINATOR,
  isAlive,
  renderText,
  type Character,
} from './character';
import type { ActionDef, Content, EventDef } from './content/schema';
import { chancePer, int, isValidSeed, pick, seedRng, weightedPick, type RngState } from './rng';

/**
 * Minimal game loop: the player picks an action with a duration, then time runs
 * day by day until an event needs a choice or the action completes.
 *
 * GameState is plain JSON data (no classes, no undefined) so a save is just
 * JSON.stringify(state). All randomness uses state.rng.
 */
export const SAVE_VERSION = 1;

export type ChronicleKind = 'start' | 'action' | 'event' | 'death' | 'succession';

export interface ChronicleEntry {
  day: number;
  characterId: string;
  kind: ChronicleKind;
  text: string;
}

export type GameStatus = 'awaiting_action' | 'awaiting_choice';

export interface GameState {
  version: typeof SAVE_VERSION;
  seed: number;
  rng: RngState;
  day: number;
  nextId: number;
  characters: Character[];
  playerId: string;
  activeAction: { actionId: string; endDay: number } | null;
  pendingEvent: { eventId: string } | null;
  /** Event id -> day it last fired. */
  lastFired: Record<string, number>;
  lastEventDay: number | null;
  chronicle: ChronicleEntry[];
  status: GameStatus;
}

export type Command = { type: 'start'; actionId: string } | { type: 'choose'; option: number };

export function getPlayer(state: GameState): Character {
  const player = state.characters.find((c) => c.id === state.playerId);
  if (!player) throw new Error(`Player character ${state.playerId} not found`);
  return player;
}

function findAction(content: Content, id: string): ActionDef {
  const action = content.actions.find((a) => a.id === id);
  if (!action) throw new Error(`Unknown action "${id}"`);
  return action;
}

function findEvent(content: Content, id: string): EventDef {
  const event = content.events.find((e) => e.id === id);
  if (!event) throw new Error(`Unknown event "${id}"`);
  return event;
}

function log(state: GameState, c: Character, kind: ChronicleKind, template: string): void {
  state.chronicle.push({ day: state.day, characterId: c.id, kind, text: renderText(template, c, state.day) });
}

function createCharacter(state: GameState, content: Content, surname: string, age: Content['settings']['startAge']): Character {
  const { settings, names } = content;
  const births = birthDayRange(state.day, age.min, age.max);
  const character: Character = {
    id: `c${state.nextId}`,
    givenName: pick(state.rng, names.given),
    surname,
    birthDay: int(state.rng, births.earliest, births.latest),
    deathDay: null,
    health: int(state.rng, settings.startHealth.min, settings.startHealth.max),
    money: 0,
  };
  state.nextId += 1;
  state.characters.push(character);
  return character;
}

export function newGame(seed: number, content: Content): GameState {
  if (!isValidSeed(seed)) throw new Error(`Invalid seed ${seed}`);
  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    rng: seedRng(seed),
    day: 0,
    nextId: 1,
    characters: [],
    playerId: '',
    activeAction: null,
    pendingEvent: null,
    lastFired: {},
    lastEventDay: null,
    chronicle: [],
    status: 'awaiting_action',
  };
  const surname = pick(state.rng, content.names.surnames);
  const founder = createCharacter(state, content, surname, content.settings.startAge);
  founder.money = content.settings.startMoney;
  state.playerId = founder.id;
  log(state, founder, 'start', content.settings.texts.start);
  return state;
}

/** Actions the player can start now. Never consumes randomness. */
export function availableActions(state: GameState, content: Content): ActionDef[] {
  return state.status === 'awaiting_action' ? content.actions : [];
}

export function pendingEventDef(state: GameState, content: Content): EventDef | null {
  return state.pendingEvent ? findEvent(content, state.pendingEvent.eventId) : null;
}

/** Applies a player command and runs time forward to the next decision. Mutates state. */
export function apply(state: GameState, content: Content, cmd: Command): void {
  if (cmd.type === 'start') {
    if (state.status !== 'awaiting_action') throw new Error(`Cannot start an action while ${state.status}`);
    const action = findAction(content, cmd.actionId);
    const duration = int(state.rng, action.duration.min, action.duration.max);
    state.activeAction = { actionId: action.id, endDay: state.day + duration };
  } else {
    if (state.status !== 'awaiting_choice' || !state.pendingEvent) {
      throw new Error(`Cannot choose an option while ${state.status}`);
    }
    const event = findEvent(content, state.pendingEvent.eventId);
    const option = event.options[cmd.option];
    if (!Number.isInteger(cmd.option) || !option) {
      throw new Error(`Event "${event.id}" has no option ${cmd.option}`);
    }
    const player = getPlayer(state);
    applyEffects(player, option.effects);
    log(state, player, 'event', option.result);
    state.pendingEvent = null;
  }
  runUntilDecision(state, content);
}

/**
 * Day order: advance the day, roll for death, complete the action on its end
 * day, otherwise roll for an event. Events never fire on the end day, so every
 * command moves time forward by at least one day.
 */
function runUntilDecision(state: GameState, content: Content): void {
  const active = state.activeAction;
  if (!active) throw new Error('No active action');
  for (;;) {
    state.day += 1;
    const player = getPlayer(state);

    if (chancePer(state.rng, dailyDeathChance(player, state.day), DAILY_DEATH_DENOMINATOR)) {
      handleDeath(state, content, player);
      return;
    }

    if (state.day >= active.endDay) {
      const action = findAction(content, active.actionId);
      applyEffects(player, action.effects);
      log(state, player, 'action', action.text);
      state.activeAction = null;
      state.status = 'awaiting_action';
      return;
    }

    const event = rollEvent(state, content, active.actionId);
    if (event) {
      state.pendingEvent = { eventId: event.id };
      state.lastFired[event.id] = state.day;
      state.lastEventDay = state.day;
      state.status = 'awaiting_choice';
      return;
    }
  }
}

function rollEvent(state: GameState, content: Content, actionId: string): EventDef | null {
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

/** Placeholder succession until the Dynasty stage (D-007): a generated adult heir inherits the money. */
function handleDeath(state: GameState, content: Content, deceased: Character): void {
  deceased.deathDay = state.day;
  log(state, deceased, 'death', content.settings.texts.death);
  const heir = createCharacter(state, content, deceased.surname, content.settings.heirAge);
  heir.money = deceased.money;
  state.playerId = heir.id;
  log(state, heir, 'succession', content.settings.texts.succession);
  state.activeAction = null;
  state.pendingEvent = null;
  state.status = 'awaiting_action';
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n);
}

/** Returns a list of broken rules; empty means the state is consistent. */
export function checkInvariants(state: GameState, content: Content): string[] {
  const problems: string[] = [];
  if (state.version !== SAVE_VERSION) problems.push(`unsupported save version ${String(state.version)}`);
  if (!isInt(state.day)) problems.push(`day is not an integer: ${state.day}`);
  if (!Array.isArray(state.rng) || state.rng.length !== 4 || !state.rng.every(isInt)) {
    problems.push('rng state is not four integers');
  }
  const ids = new Set<string>();
  for (const c of state.characters) {
    if (ids.has(c.id)) problems.push(`duplicate character id ${c.id}`);
    ids.add(c.id);
    if (!isInt(c.health) || c.health < 0 || c.health > 100) problems.push(`${c.id} health out of range: ${c.health}`);
    if (!isInt(c.money)) problems.push(`${c.id} money is not an integer: ${c.money}`);
    if (!isInt(c.birthDay) || c.birthDay > state.day) problems.push(`${c.id} has invalid birth day ${c.birthDay}`);
    if (c.deathDay !== null && (!isInt(c.deathDay) || c.deathDay > state.day || c.deathDay < c.birthDay)) {
      problems.push(`${c.id} has invalid death day ${c.deathDay}`);
    }
  }
  const player = state.characters.find((c) => c.id === state.playerId);
  if (!player) problems.push(`player ${state.playerId} does not exist`);
  else if (!isAlive(player)) problems.push(`player ${state.playerId} is dead`);

  if (state.status === 'awaiting_action') {
    if (state.activeAction !== null || state.pendingEvent !== null) {
      problems.push('awaiting_action with an active action or pending event');
    }
  } else if (state.status === 'awaiting_choice') {
    if (!state.activeAction || !state.pendingEvent) problems.push('awaiting_choice without an action and event');
  } else {
    problems.push(`unknown status ${String(state.status)}`);
  }
  if (state.activeAction) {
    if (!content.actions.some((a) => a.id === state.activeAction?.actionId)) {
      problems.push(`unknown active action ${state.activeAction.actionId}`);
    }
    if (!isInt(state.activeAction.endDay) || state.activeAction.endDay <= state.day) {
      problems.push(`active action ends on day ${state.activeAction.endDay}, not after ${state.day}`);
    }
  }
  if (state.pendingEvent && !content.events.some((e) => e.id === state.pendingEvent?.eventId)) {
    problems.push(`unknown pending event ${state.pendingEvent.eventId}`);
  }
  let prevDay = -Infinity;
  for (const entry of state.chronicle) {
    if (entry.day < prevDay) problems.push(`chronicle goes back in time at ${formatDate(entry.day)}`);
    prevDay = entry.day;
    if (!ids.has(entry.characterId)) problems.push(`chronicle refers to unknown character ${entry.characterId}`);
  }
  return problems;
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string, content: Content): GameState {
  const state = JSON.parse(json) as GameState;
  const problems = checkInvariants(state, content);
  if (problems.length > 0) throw new Error(`Invalid save: ${problems.join('; ')}`);
  return state;
}
