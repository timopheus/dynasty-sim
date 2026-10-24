/**
 * Assembly file (D-052): GameState and Character are built from the parts each
 * module declares in its own folder. Modules change only their part; adding a
 * new part here is a change between waves.
 *
 * GameState is plain JSON data (no classes, Map/Set or undefined) so a save is
 * just JSON.stringify(state). All randomness uses state.rng.
 */
import { initActionsState, type ActionsState } from './actions/actions';
import { initArchiveState, type ArchiveState } from './archive/chunks';
import { initBackstoryState, type BackstoryState } from './backstory/backstory';
import type { CharacterBase } from './character/character';
import { initChronicleState, type ChronicleState } from './chronicle/log';
import type { Content } from './content/schema';
import { initEventsState, type EventsState } from './events/events';
import { initFamilyState, type FamilyCharacter, type FamilyState, type Marriage } from './family/family';
import { initHealthState, type HealthPart, type HealthState } from './health/health';
import { initHeirloomState, type HeirloomState } from './heirloom/heirloom';
import { initHouseState, type HouseCharacter, type HouseState } from './house/house';
import { initNarratorState, type NarratorState } from './narrator/narrator';
import { initRelationsState, type RelationsCharacter, type RelationsState } from './relations/relations';
import { seedRng, type RngState } from './rng';
import { SAVE_VERSION } from './save/version';
import { initStoriesState, type StoriesState } from './stories/stories';
import { initSuccessionState, type SuccessionState } from './succession/succession';
import { initSummaryState, type SummaryState } from './summary/summary';
import { initTimeState, type TimeState } from './time/time';
import { initWorldState, type WorldCharacter, type WorldState } from './world/world';

export type Character = CharacterBase & HealthPart & WorldCharacter & RelationsCharacter & FamilyCharacter & HouseCharacter;

/**
 * `awaiting_action`: the player picks an action. `awaiting_choice`: an event waits for an answer; there may be no
 * action (scenes of the backstory, 3.11). `ended`: the house has come to an end (D-315) — nobody inherits, or the
 * player ended it; no action, no event, and `apply` takes no more commands.
 */
/**
 * `awaiting_action`: the player picks an action. `running`: an action is under way and only `wait` moves time on
 * (D-439). `awaiting_choice`: an event waits for an answer. `ended`: the house has come to an end (D-315).
 */
export type GameStatus = 'awaiting_action' | 'running' | 'awaiting_choice' | 'ended';

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
  BackstoryState &
  FamilyState &
  HouseState &
  SuccessionState &
  HeirloomState &
  ArchiveState &
  SummaryState;

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
    ...initFamilyState(),
    ...initHouseState(),
    ...initSuccessionState(),
    ...initHeirloomState(),
    ...initArchiveState(),
    ...initSummaryState(),
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
  /** Known parents (D-313); absent means unknown. */
  father?: string;
  mother?: string;
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

/**
 * After the hero died and the heir took over (lifecycle.ts, D-314): `heir` is the new hero. Runs in the fixed order of
 * SUCCESSION_HOOKS; a file with such a hook never imports lifecycle.ts (import cycle).
 */
export type SuccessionHook = (ctx: Ctx, deceased: Character, heir: Character) => void;

/** After a marriage is recorded (hooks.ts, called by the marriage of family/, 4.5). */
export type MarriageHook = (ctx: Ctx, marriage: Marriage) => void;

/**
 * Ids of the people a module's hot data refers to (refs.ts, D-312): they stay in the hot part, the archive does not
 * take them. Order and repeats do not matter. A pure query.
 */
export type RefsFn = (ctx: Ctx) => string[];
