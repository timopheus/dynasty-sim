import { availableActions } from '../core/actions/actions';
import type { Content } from '../core/content/schema';
import { apply, MAX_WAIT_DAYS, timeRuns } from '../core/game';
import { applyRecorded, type Journal } from '../core/save/journal';
import type { GameState } from '../core/state';

/**
 * The time player (S.8, D-439): pause and three speeds. Only `wait` moves time; the clock gives one `wait 1` a tick.
 * No DOM here, so tests run it without a browser.
 */

export type Speed = 1 | 2 | 5;
export const SPEEDS: readonly Speed[] = [1, 2, 5];

/** ×1 is one game day a second (Tim's choice, 24.10). */
export const DAY_MS = 1000;

/** Milliseconds between two days at a speed. */
export function tickMs(speed: Speed): number {
  return DAY_MS / speed;
}

/** With time running the game saves on a decision, on pause and once in this many game days (D-439). */
export const SAVE_EVERY_DAYS = 30;

export interface Clock {
  speed: Speed;
  /** The player paused the clock; a stop on a decision is not a pause and ends by itself. */
  paused: boolean;
  /** Days run since the last save. */
  unsaved: number;
}

/** A new game runs at ×1; a game loaded after a reload starts paused, the player picks it up himself. */
export function newClock(paused: boolean): Clock {
  return { speed: 1, paused, unsaved: 0 };
}

/**
 * What the clock does now. `decision`: an event or a window waits for an answer. `idle`: no occupation, the player
 * chooses one (or presses "Play" to live as he will). `ended`: the house is over.
 */
export type ClockMode = 'running' | 'paused' | 'decision' | 'idle' | 'ended';

export function clockMode(state: GameState, clock: Clock, windowOpen: boolean): ClockMode {
  if (state.status === 'ended') return 'ended';
  if (windowOpen || state.status === 'awaiting_choice') return 'decision';
  if (timeRuns(state)) return clock.paused ? 'paused' : 'running';
  return 'idle';
}

/** The speed a digit key asks for when no window is open (D-448): 1, 2, 3 → ×1, ×2, ×5. */
export function speedForKey(key: string): Speed | null {
  const i = ['1', '2', '3'].indexOf(key);
  return i < 0 ? null : (SPEEDS[i] ?? null);
}

export interface SpaceKey {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  /** Tag of the focused element. */
  target?: string;
}

/** Space pauses, unless the focus is on a button or a link (Space presses those) or in a field (D-448). */
export function isPauseKey(e: SpaceKey): boolean {
  if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
  return !(e.target && /^(button|a|input|textarea|select|summary)$/i.test(e.target));
}

/** The idle action ("Live as you will", S.6) the hero may start now, or null (a severe illness, a child). */
export function idleAction(state: GameState, content: Content, id?: string): string | null {
  const found = availableActions({ state, content }).find((a) => a.idle && (id === undefined || a.id === id));
  return found?.id ?? null;
}

/**
 * One day: `wait 1`, glued to the `wait` just before it in the journal (D-439). That is the same game: a wait cut short
 * by a phase always leaves a decision (an event, the end of an action, a death), so the next command is not a wait.
 */
export function waitDay(journal: Journal, state: GameState, content: Content): void {
  apply(state, content, { type: 'wait', days: 1 });
  const at = journal.commands.length - 1;
  const last = journal.commands[at];
  if (last?.type === 'wait' && last.days < MAX_WAIT_DAYS) journal.commands[at] = { type: 'wait', days: last.days + 1 };
  else journal.commands.push({ type: 'wait', days: 1 });
}

/**
 * A tick of the clock: one day, then either time runs on, or it stops on a decision. When the idle action ends the
 * clock starts it again and runs on; it stops if the hero may not live as he wills (a severe illness) or is another
 * person (the head died). Returns whether the clock stopped.
 */
export function tick(journal: Journal, state: GameState, content: Content): boolean {
  const before = state.activeAction?.actionId ?? null;
  const hero = state.playerId;
  waitDay(journal, state, content);
  if (timeRuns(state)) return false;
  if (state.status !== 'awaiting_action' || state.pendingEvent || state.playerId !== hero || before === null) return true;
  const again = idleAction(state, content, before);
  if (again === null) return true;
  applyRecorded(journal, state, content, { type: 'start', actionId: again });
  return !timeRuns(state);
}
