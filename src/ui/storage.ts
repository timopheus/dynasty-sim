import type { Content } from '../core/content/schema';
import { journalFromData, type Journal } from '../core/save/journal';
import { chunkSave, hotSave, readSaveParts, type SaveFailure } from '../core/save/save';
import type { GameState } from '../core/state';

/**
 * The autosave in IndexedDB (D-234, D-339): the hot part, the chunks of the archive and the journal of commands
 * (D-202). The hot part is rewritten after every command; a chunk and a command are written once, by number, and
 * never again. One write is one transaction: all of it lands or none (a crash, a second tab). Nothing here touches
 * the DOM; tests pass a fake store.
 */

/**
 * `save` holds the hot part (`hot`), the head of the journal (`journal`) and the mark of the game (`game`); `chunks` and
 * `commands` are by number, from 0 without gaps.
 */
export type StoreName = 'save' | 'chunks' | 'commands';

export const STORES: readonly StoreName[] = ['save', 'chunks', 'commands'];

/** `expect`: the key holds this value, or the whole transaction fails with a `ConstraintError`. */
export type StoreOp =
  | { kind: 'put' | 'add' | 'expect'; store: StoreName; key: string | number; value: string }
  | { kind: 'clear'; store: StoreName };

export type Records = { key: string | number; value: string }[];

/** What the game needs of IndexedDB; tests pass a fake. */
export interface AsyncStore {
  /**
   * One transaction: every op lands or none does. `add` of a key already there and an `expect` that does not hold
   * fail it with a `ConstraintError`.
   */
  run(ops: readonly StoreOp[]): Promise<void>;
  /** Every store, values in the order of their keys, read in one transaction. */
  readAll(): Promise<Record<StoreName, Records>>;
}

/**
 * Which game the store holds and how much of its archive and journal: what the next write leaves out. `game` is the
 * mark a new game writes; a write checks it, so a tab that still plays a replaced game never writes into the new one.
 */
export interface Saved {
  game: string;
  chunks: number;
  commands: number;
}

export type LoadOutcome =
  | { kind: 'none' }
  | { kind: 'loaded'; state: GameState; journal: Journal; saved: Saved }
  /** A save exists but cannot be used: the game says so and starts anew (D-058, D-202). The journal, if it reads, is offered. */
  | { kind: 'discarded'; reason: SaveFailure | 'unreadable'; message: string; journal: Journal | null };

/** `conflict`: another tab wrote the save first, or began a new game. */
export type SaveOutcome = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' | 'conflict'; message: string };

const HOT = 'hot';
const JOURNAL = 'journal';
const GAME = 'game';

/** The journal from its head and commands; null when it does not read. */
function journalOf(head: string | undefined, commands: string[]): Journal | null {
  if (head === undefined) return null;
  try {
    const read = journalFromData({ ...(JSON.parse(head) as object), commands: commands.map((c) => JSON.parse(c) as unknown) });
    return read.ok ? read.journal : null;
  } catch {
    return null;
  }
}

/** Keys 0, 1, 2… without a gap. */
const numbered = (records: Records) => records.every((r, i) => r.key === i);

/** Reads the whole save into memory (D-312: lazy reading waits until the archive grows to tens of MB). Never throws. */
export async function loadGame(store: AsyncStore | null, content: Content, contentVersion: string): Promise<LoadOutcome> {
  if (!store) return { kind: 'none' };
  let all: Record<StoreName, Records>;
  try {
    all = await store.readAll();
  } catch {
    return { kind: 'discarded', reason: 'unreadable', message: 'Browser storage cannot be read', journal: null };
  }
  const value = (key: string) => all.save.find((r) => r.key === key)?.value;
  const hot = value(HOT);
  if (hot === undefined) return { kind: 'none' };
  const journal = numbered(all.commands) ? journalOf(value(JOURNAL), all.commands.map((r) => r.value)) : null;
  const game = value(GAME);
  if (!numbered(all.chunks)) return { kind: 'discarded', reason: 'corrupt', message: 'The chunks of the archive are not numbered in a row', journal };
  const result = readSaveParts({ hot, chunks: all.chunks.map((r) => r.value) }, content, contentVersion);
  if (!result.ok) return { kind: 'discarded', reason: result.reason, message: result.message, journal };
  if (!journal || game === undefined) return { kind: 'discarded', reason: 'corrupt', message: 'The journal of the game does not read', journal: null };
  return { kind: 'loaded', state: result.state, journal, saved: { game, chunks: all.chunks.length, commands: all.commands.length } };
}

function failure(error: unknown): SaveOutcome {
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  if (name === 'ConstraintError') return { ok: false, reason: 'conflict', message: 'The game was saved from another tab' };
  if (name === 'QuotaExceededError') return { ok: false, reason: 'quota', message: 'Browser storage is full' };
  return { ok: false, reason: 'unavailable', message: error instanceof Error ? error.message : 'Browser storage refused the save' };
}

/**
 * What a write puts in: the check of the game, the hot part, then the chunks and the commands made since `saved`.
 * Throws on a state that is not plain JSON.
 */
function writeOps(state: GameState, journal: Journal, saved: Saved, contentVersion: string): StoreOp[] {
  const ops: StoreOp[] = [
    { kind: 'expect', store: 'save', key: GAME, value: saved.game },
    { kind: 'put', store: 'save', key: HOT, value: hotSave(state, contentVersion) },
  ];
  for (let i = saved.chunks; i < state.archive.length; i++) ops.push({ kind: 'add', store: 'chunks', key: i, value: chunkSave(state, i) });
  // The clock glues each day to the `wait` before it (S.8): the last command saved may have grown since.
  const last = saved.commands - 1;
  const grown = journal.commands[last];
  if (grown?.type === 'wait') ops.push({ kind: 'put', store: 'commands', key: last, value: JSON.stringify(grown) });
  for (let i = saved.commands; i < journal.commands.length; i++) ops.push({ kind: 'add', store: 'commands', key: i, value: JSON.stringify(journal.commands[i]) });
  return ops;
}

async function write(store: AsyncStore | null, ops: () => StoreOp[]): Promise<SaveOutcome> {
  if (!store) return { ok: false, reason: 'unavailable', message: 'Browser storage is not available' };
  let list: StoreOp[];
  try {
    list = ops();
  } catch (error) {
    return { ok: false, reason: 'unavailable', message: error instanceof Error ? error.message : String(error) };
  }
  try {
    await store.run(list);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Writes the hot part, the chunks and the commands made since the last write, in one transaction; on success `saved`
 * moves on. Never throws: a failed write leaves the previous save as it was. The next command waits for this (D-234).
 */
export async function saveGame(store: AsyncStore | null, state: GameState, journal: Journal, saved: Saved, contentVersion: string): Promise<SaveOutcome> {
  const outcome = await write(store, () => writeOps(state, journal, saved, contentVersion));
  if (outcome.ok) {
    saved.chunks = state.archive.length;
    saved.commands = journal.commands.length;
  }
  return outcome;
}

/**
 * A new game replaces whatever was saved, in one transaction, under a new mark `game` (unique per game: the caller
 * makes it). `saved` tells what is saved now.
 */
export async function startGame(store: AsyncStore | null, state: GameState, journal: Journal, contentVersion: string, game: string): Promise<{ outcome: SaveOutcome; saved: Saved }> {
  const saved: Saved = { game, chunks: 0, commands: 0 };
  const head = JSON.stringify({ ...journal, commands: [] });
  const outcome = await write(store, () => [
    ...STORES.map((name): StoreOp => ({ kind: 'clear', store: name })),
    { kind: 'put', store: 'save', key: GAME, value: game },
    { kind: 'put', store: 'save', key: JOURNAL, value: head },
    ...writeOps(state, journal, saved, contentVersion),
  ]);
  if (outcome.ok) {
    saved.chunks = state.archive.length;
    saved.commands = journal.commands.length;
  }
  return { outcome, saved };
}

export async function clearGame(store: AsyncStore | null): Promise<void> {
  try {
    await store?.run(STORES.map((store) => ({ kind: 'clear', store })));
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/** The autosave of the game before IndexedDB (D-140): one `localStorage` cell, removed at start. */
export const OLD_SAVE_KEY = 'dynasty-sim:save';

export function dropOldSave(store: { removeItem(key: string): void } | null): void {
  try {
    store?.removeItem(OLD_SAVE_KEY);
  } catch {
    // Storage that cannot be touched holds nothing to remove.
  }
}

const DB_NAME = 'dynasty-sim';
const DB_VERSION = 1;

/**
 * The part of IndexedDB used here, typed by hand: tests and tools type-check without the DOM library, and only
 * main.ts hands in the real `indexedDB`.
 */
/** An event handler of IndexedDB; the event itself is never read. */
type Handler = ((event: never) => unknown) | null;
interface Handlers {
  error: unknown;
  onerror: Handler;
}
interface IdbRequest<T> extends Handlers {
  result: T;
  onsuccess: Handler;
}
interface IdbObjectStore {
  add(value: string, key: string | number): unknown;
  put(value: string, key: string | number): unknown;
  clear(): unknown;
  getAll(): IdbRequest<unknown[]>;
  getAllKeys(): IdbRequest<unknown[]>;
  get(key: string | number): IdbRequest<unknown>;
}
interface IdbTransaction extends Handlers {
  objectStore(name: string): IdbObjectStore;
  abort(): void;
  oncomplete: Handler;
  onabort: Handler;
}
interface IdbDatabase {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string): unknown;
  transaction(names: string | string[], mode: 'readonly' | 'readwrite', options?: { durability: 'strict' }): IdbTransaction;
}
interface IdbOpenRequest extends IdbRequest<IdbDatabase> {
  onupgradeneeded: Handler;
  onblocked: Handler;
}
export interface IdbFactory {
  open(name: string, version: number): IdbOpenRequest;
}

/** Resolves when the transaction is committed; rejects with its error when it is aborted. */
function committed(tx: IdbTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    // The failed request carries the error (a ConstraintError for a key written twice); tx.error may still be null.
    const fail = (event: { target?: { error?: unknown } | null }) => reject(event.target?.error ?? tx.error ?? new Error('The transaction failed'));
    tx.onerror = fail;
    tx.onabort = fail;
  });
}

/** IndexedDB behind AsyncStore. Rejects where IndexedDB is missing or refused (private modes). */
export function openIndexedDb(factory: IdbFactory): Promise<AsyncStore> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      for (const name of STORES) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB cannot be opened'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
    request.onsuccess = () => {
      const db = request.result;
      resolve({
        async run(ops) {
          const tx = db.transaction([...STORES], 'readwrite', { durability: 'strict' });
          let refused: Error | null = null;
          const finished = committed(tx);
          for (const op of ops) {
            const os = tx.objectStore(op.store);
            // A failed request aborts the whole transaction: nothing of it lands.
            if (op.kind === 'clear') os.clear();
            else if (op.kind === 'add') os.add(op.value, op.key);
            else if (op.kind === 'put') os.put(op.value, op.key);
            else {
              const got = os.get(op.key);
              got.onsuccess = () => {
                if (got.result === op.value) return;
                refused = Object.assign(new Error(`${op.store}/${String(op.key)} does not hold what this tab saved`), { name: 'ConstraintError' });
                tx.abort();
              };
            }
          }
          try {
            await finished;
          } catch (error) {
            throw refused ?? error;
          }
        },
        async readAll() {
          const tx = db.transaction([...STORES], 'readonly');
          const reads = STORES.map((name) => {
            const os = tx.objectStore(name);
            return { name, keys: os.getAllKeys(), values: os.getAll() };
          });
          await committed(tx);
          const out = { save: [], chunks: [], commands: [] } as Record<StoreName, Records>;
          for (const r of reads) out[r.name] = r.keys.result.map((key, i) => ({ key: key as string | number, value: r.values.result[i] as string }));
          return out;
        },
      });
    };
  });
}

/** The seed asked for in the address (`?seed=N`), or null when there is none or it is not valid. */
export function seedFromSearch(search: string, isValid: (n: number) => boolean): number | null {
  const param = new URLSearchParams(search).get('seed');
  if (param === null || param.trim() === '') return null;
  const seed = Number(param);
  return isValid(seed) ? seed : null;
}

/**
 * What to do at start: continue the saved game, or begin a new one. A saved game is kept unless
 * the address asks for another seed.
 */
export function startChoice(outcome: LoadOutcome, requestedSeed: number | null): 'continue' | 'ask_replace' | 'new' {
  if (outcome.kind !== 'loaded') return 'new';
  return requestedSeed === null || requestedSeed === outcome.state.seed ? 'continue' : 'ask_replace';
}
