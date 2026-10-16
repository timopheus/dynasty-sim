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

/** `save` holds the hot part (`hot`) and the head of the journal (`journal`); `chunks` and `commands` are by number. */
export type StoreName = 'save' | 'chunks' | 'commands';

export const STORES: readonly StoreName[] = ['save', 'chunks', 'commands'];

export type StoreOp =
  | { kind: 'put' | 'add'; store: StoreName; key: string | number; value: string }
  | { kind: 'clear'; store: StoreName };

/** What the game needs of IndexedDB; tests pass a fake. */
export interface AsyncStore {
  /** One transaction: every op lands or none does. `add` of a key already there fails it with a `ConstraintError`. */
  run(ops: readonly StoreOp[]): Promise<void>;
  /** Values of a store in the order of their keys. */
  values(store: StoreName): Promise<{ key: string | number; value: string }[]>;
}

/** How much of the archive and the journal the store holds: what the next write leaves out. */
export interface Saved {
  chunks: number;
  commands: number;
}

export type LoadOutcome =
  | { kind: 'none' }
  | { kind: 'loaded'; state: GameState; journal: Journal; saved: Saved }
  /** A save exists but cannot be used: the game says so and starts anew (D-058, D-202). The journal, if it reads, is offered. */
  | { kind: 'discarded'; reason: SaveFailure | 'unreadable'; message: string; journal: Journal | null };

/** `conflict`: another tab wrote the save first (a chunk or a command of that number is already there). */
export type SaveOutcome = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' | 'conflict'; message: string };

const HOT = 'hot';
const JOURNAL = 'journal';

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

/** Reads the whole save into memory (D-312: lazy reading waits until the archive grows to tens of MB). Never throws. */
export async function loadGame(store: AsyncStore | null, content: Content, contentVersion: string): Promise<LoadOutcome> {
  if (!store) return { kind: 'none' };
  let save: { key: string | number; value: string }[];
  let chunks: { key: string | number; value: string }[];
  let commands: { key: string | number; value: string }[];
  try {
    [save, chunks, commands] = await Promise.all([store.values('save'), store.values('chunks'), store.values('commands')]);
  } catch {
    return { kind: 'discarded', reason: 'unreadable', message: 'Browser storage cannot be read', journal: null };
  }
  const hot = save.find((r) => r.key === HOT)?.value;
  const journal = journalOf(save.find((r) => r.key === JOURNAL)?.value, commands.map((r) => r.value));
  if (hot === undefined) return { kind: 'none' };
  const result = readSaveParts({ hot, chunks: chunks.map((r) => r.value) }, content, contentVersion);
  if (!result.ok) return { kind: 'discarded', reason: result.reason, message: result.message, journal };
  if (!journal) return { kind: 'discarded', reason: 'corrupt', message: 'The journal of the game does not read', journal: null };
  return { kind: 'loaded', state: result.state, journal, saved: { chunks: chunks.length, commands: commands.length } };
}

function failure(error: unknown): SaveOutcome {
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  if (name === 'ConstraintError') return { ok: false, reason: 'conflict', message: 'The game was saved from another tab' };
  if (name === 'QuotaExceededError') return { ok: false, reason: 'quota', message: 'Browser storage is full' };
  return { ok: false, reason: 'unavailable', message: error instanceof Error ? error.message : 'Browser storage refused the save' };
}

/** What a write puts in: the hot part, then the chunks and the commands made since `saved`. Throws on a state that is not plain JSON. */
function writeOps(state: GameState, journal: Journal, saved: Saved, contentVersion: string): StoreOp[] {
  const ops: StoreOp[] = [{ kind: 'put', store: 'save', key: HOT, value: hotSave(state, contentVersion) }];
  for (let i = saved.chunks; i < state.archive.length; i++) ops.push({ kind: 'add', store: 'chunks', key: i, value: chunkSave(state, i) });
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

/** A new game replaces whatever was saved, in one transaction. `saved` tells what is saved now. */
export async function startGame(store: AsyncStore | null, state: GameState, journal: Journal, contentVersion: string): Promise<{ outcome: SaveOutcome; saved: Saved }> {
  const saved: Saved = { chunks: 0, commands: 0 };
  const head = JSON.stringify({ ...journal, commands: [] });
  const outcome = await write(store, () => [
    ...STORES.map((name): StoreOp => ({ kind: 'clear', store: name })),
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
}
interface IdbTransaction extends Handlers {
  objectStore(name: string): IdbObjectStore;
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
    tx.onabort = () => reject(tx.error ?? new Error('The transaction was aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('The transaction failed'));
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
          const finished = committed(tx);
          for (const op of ops) {
            const os = tx.objectStore(op.store);
            // A failed request aborts the whole transaction: nothing of it lands.
            if (op.kind === 'clear') os.clear();
            else if (op.kind === 'add') os.add(op.value, op.key);
            else os.put(op.value, op.key);
          }
          await finished;
        },
        async values(store) {
          const tx = db.transaction(store, 'readonly');
          const os = tx.objectStore(store);
          const keys = os.getAllKeys();
          const values = os.getAll();
          await committed(tx);
          return keys.result.map((key, i) => ({ key: key as string | number, value: values.result[i] as string }));
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
