import type { Content } from '../content/schema';
import { apply, MAX_WAIT_DAYS, newGame, timeRuns, type Command } from '../game';
import type { GameState } from '../state';

/**
 * Journal of commands (D-202): the seed, the version of the content and every command of `apply`, in order. It
 * plays the game again on the same content (D-003): for reports of bugs, regression tests and a look at a game. Not a
 * save: on another content the story goes elsewhere.
 */
export interface Journal {
  /** Format of the journal; readJournal refuses any other. */
  journal: number;
  seed: number;
  /** contentVersion() of the content the game began on. */
  content: string;
  commands: Command[];
}

/** 2: time moves only by `wait` (D-439); a journal of format 1 has no waits and would play another game. */
export const JOURNAL_VERSION = 2;

export function newJournal(seed: number, contentVersion: string): Journal {
  return { journal: JOURNAL_VERSION, seed, content: contentVersion, commands: [] };
}

/** Applies a command and records it once it went through; a refused command is not recorded. */
export function applyRecorded(journal: Journal, state: GameState, content: Content, cmd: Command): void {
  apply(state, content, cmd);
  journal.commands.push(cmd);
}

/** `play` recorded: the command, then a recorded `wait` until the next decision if time runs. */
export function playRecorded(journal: Journal, state: GameState, content: Content, cmd: Command): void {
  applyRecorded(journal, state, content, cmd);
  if (timeRuns(state)) applyRecorded(journal, state, content, { type: 'wait', days: MAX_WAIT_DAYS });
}

/** The game the journal records, played again from the seed. Throws when a command is refused. */
export function replay(content: Content, journal: Journal): GameState {
  const state = newGame(journal.seed, content);
  journal.commands.forEach((cmd, i) => {
    try {
      apply(state, content, cmd);
    } catch (error) {
      throw new Error(`Command ${i + 1} (${cmd.type}) is refused: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  return state;
}

const COMMAND_TYPES: readonly string[] = ['start', 'choose', 'wait', 'end', 'will', 'propose'];

export type JournalResult = { ok: true; journal: Journal } | { ok: false; message: string };

/** Reads a journal from JSON; an error message instead of throwing. Commands are checked for their type only. */
export function readJournal(json: string): JournalResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, message: 'The journal is not valid JSON' };
  }
  return journalFromData(data);
}

/** The same for data already parsed. */
export function journalFromData(data: unknown): JournalResult {
  const j = data as Partial<Journal> | null;
  if (typeof j !== 'object' || j === null || j.journal !== JOURNAL_VERSION) return { ok: false, message: `Not a journal of format ${JOURNAL_VERSION}` };
  if (typeof j.seed !== 'number' || typeof j.content !== 'string' || !Array.isArray(j.commands)) return { ok: false, message: 'The journal has no seed, content or commands' };
  for (const [i, c] of j.commands.entries()) {
    if (typeof c !== 'object' || c === null || !COMMAND_TYPES.includes((c as { type?: unknown }).type as string)) {
      return { ok: false, message: `Command ${i + 1} is not a command` };
    }
  }
  return { ok: true, journal: j as Journal };
}
