/**
 * Assembly file (D-052): GameState and Character are built from the parts each
 * module declares in its own folder. Modules change only their part; adding a
 * new part here is a change between waves.
 *
 * GameState is plain JSON data (no classes, Map/Set or undefined) so a save is
 * just JSON.stringify(state). All randomness uses state.rng.
 */
import { initActionsState, type ActionsState } from './actions/actions';
import { initBackstoryState, type BackstoryState } from './backstory/backstory';
import type { CharacterBase } from './character/character';
import { initChronicleState, type ChronicleState } from './chronicle/log';
import type { Content } from './content/schema';
import { initEventsState, type EventsState } from './events/events';
import { initHealthState, type HealthPart, type HealthState } from './health/health';
import { initNarratorState, type NarratorState } from './narrator/narrator';
import { initRelationsState, type RelationsCharacter, type RelationsState } from './relations/relations';
import { seedRng, type RngState } from './rng';
import { SAVE_VERSION } from './save/version';
import { initStoriesState, type StoriesState } from './stories/stories';
import { initTimeState, type TimeState } from './time/time';
import { initWorldState, type WorldCharacter, type WorldState } from './world/world';

export type Character = CharacterBase & HealthPart & WorldCharacter & RelationsCharacter;

/**
 * `awaiting_action`: the player picks an action. `awaiting_choice`: an event waits for an answer; there may be no
 * action (scenes of the backstory, 3.11).
 */
export type GameStatus = 'awaiting_action' | 'awaiting_choice';

export interface CoreState {
  version: number;
  seed: number;
  rng: RngState;
  /** Day number, 0 is 1 January 1700 (time/calendar.ts). */
  day: number;
  /** Counter behind newId; ids are never reused, entities are never deleted. */
  nextId: number;
  characters: Character[];
  playerId: string;
  status: GameStatus;
}

export type GameState = CoreState &
  TimeState &
  ActionsState &
  EventsState &
  WorldState &
  RelationsState &
  ChronicleState &
  HealthState &
  NarratorState &
  StoriesState &
  BackstoryState;

/** What hooks, phases and effects get: the state to change and the content it runs on. */
export interface Ctx {
  state: GameState;
  content: Content;
}

/**
 * Scope of roles (D-162): role name -> character id. Built-in roles: `hero` (the current hero) and `protagonist`
 * (the main participant; the hero in hero events). Conditions, effects and texts of events see the people
 * through it.
 */
export type Scope = Readonly<Record<string, string>>;

export function initialState(seed: number): GameState {
  return {
    version: SAVE_VERSION,
    seed,
    rng: seedRng(seed),
    day: 0,
    nextId: 1,
    characters: [],
    playerId: '',
    status: 'awaiting_action',
    ...initTimeState(),
    ...initActionsState(),
    ...initEventsState(),
    ...initWorldState(),
    ...initRelationsState(),
    ...initChronicleState(),
    ...initHealthState(),
    ...initNarratorState(),
    ...initStoriesState(),
    ...initBackstoryState(),
  };
}

/** One step of the day loop (D-053). Returns true when the player now has a decision to make. */
export interface DayPhase {
  id: string;
  run(ctx: Ctx): boolean;
}

/** What lifecycle.createCharacter is asked for; hooks read it to fill their part. */
export interface NewCharacter {
  surname: string;
  /** Age in full years on the current day. */
  age: { min: number; max: number };
}

/** Fills a module's part of a new character. Hooks run in the fixed order of lifecycle.ts. */
export type CreateHook = (ctx: Ctx, c: Character, spec: NewCharacter) => void;

/** Runs after a character has died (deathDay and deathCause are set). */
export type DeathHook = (ctx: Ctx, c: Character, cause: string) => void;

/**
 * Runs once when a new game starts, after the founder and the `start` line, in the fixed order of game.ts
 * (D-167): the circle, then the backstory. May leave an event waiting for the player.
 */
export type NewGameHook = (ctx: Ctx) => void;

/** Runs after a choice that left no event waiting (D-187): may start the next scene of the backstory (3.11, D-179). */
export type AfterChoiceHook = (ctx: Ctx) => void;

/** Returns broken rules of one module; empty means consistent. */
export type Invariant = (ctx: Ctx) => string[];
