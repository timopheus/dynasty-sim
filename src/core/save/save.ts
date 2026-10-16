import { archiveProblems } from '../archive/archive';
import type { ArchiveChunk } from '../archive/chunks';
import type { Content } from '../content/schema';
import { checkInvariants } from '../invariants';
import type { GameState } from '../state';

import { decodeCompact, encodeCompact } from './compact';
import { SAVE_VERSION } from './version';

export { SAVE_VERSION };

/** Paths where the value is not plain JSON data: undefined, NaN or Infinity, functions, class instances, Map/Set. */
export function jsonProblems(value: unknown, path = 'state'): string[] {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [`${path} is ${value}`];
  if (Array.isArray(value)) return value.flatMap((v, i) => jsonProblems(v, `${path}[${i}]`));
  if (typeof value === 'object') {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return [`${path} is not a plain object`];
    return Object.entries(value).flatMap(([k, v]) => jsonProblems(v, `${path}.${k}`));
  }
  return [`${path} is ${typeof value}`];
}

/**
 * A save is the hot part and the chunks of the archive (D-312), each its own JSON text in the compact form of
 * compact.ts (D-195), each with the format version as a plain top-level field, so a save of any format is refused by
 * it before anything else is read (D-058):
 * - the hot part `{version, content, archive, shapes, state}`: the state with an empty archive, the version of the
 *   content it was played on (D-202) and the number of chunks;
 * - a chunk `{version, chunk, shapes, data}`: its number and the chunk. A chunk never changes once made, so storage
 *   writes it once (src/ui/storage.ts).
 * `serialize` puts them into one text, `{version, hot, chunks}`, for tests, metrics and files.
 */
export interface SaveParts {
  hot: string;
  chunks: string[];
}

function assertPlain(value: unknown, path: string): void {
  const problems = jsonProblems(value, path);
  if (problems.length > 0) throw new Error(`State is not plain JSON: ${problems.slice(0, 5).join('; ')}`);
}

/** The hot part: everything but the chunks of the archive. */
export function hotSave(state: GameState, contentVersion = ''): string {
  const hot = { ...state, archive: [] };
  assertPlain(hot, 'state');
  const { shapes, data } = encodeCompact(hot);
  return JSON.stringify({ version: SAVE_VERSION, content: contentVersion, archive: state.archive.length, shapes, state: data });
}

/** Chunk number `index` of the archive. */
export function chunkSave(state: GameState, index: number): string {
  const chunk = state.archive[index];
  if (!chunk) throw new Error(`No archive chunk ${index}`);
  assertPlain(chunk, `archive[${index}]`);
  const { shapes, data } = encodeCompact(chunk);
  return JSON.stringify({ version: SAVE_VERSION, chunk: index, shapes, data });
}

export function saveParts(state: GameState, contentVersion = ''): SaveParts {
  return { hot: hotSave(state, contentVersion), chunks: state.archive.map((_, i) => chunkSave(state, i)) };
}

/** The whole save as one text. */
export function serialize(state: GameState, contentVersion = ''): string {
  const { hot, chunks } = saveParts(state, contentVersion);
  return `{"version":${SAVE_VERSION},"hot":${hot},"chunks":[${chunks.join(',')}]}`;
}

/**
 * `content_changed`: the save does not pass the checks and was made on another version of the content (D-202) — the
 * game says the content changed, not that the save is broken.
 */
export type SaveFailure = 'old_version' | 'corrupt' | 'content_changed';

export type SaveResult = { ok: true; state: GameState } | { ok: false; reason: SaveFailure; message: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function failure(reason: SaveFailure, message: string): SaveResult {
  return { ok: false, reason, message };
}

/**
 * Reads a save without throwing. A save of another format version is refused before anything else looks at it: it
 * is not migrated, the caller starts a new game (D-058). The hot part gets its invariants, the archive its own check.
 * `contentVersion` is the version of the content the game runs on now; a save that fails on another one is
 * `content_changed`. Everything else that does not load is `corrupt`.
 */
export function readSave(json: string, content: Content, contentVersion?: string): SaveResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return failure('corrupt', 'Save is not valid JSON');
  }
  if (!isObject(data)) return failure('corrupt', 'Save is not an object');
  if (data.version !== SAVE_VERSION) return oldVersion(data.version);
  if (!Array.isArray(data.chunks)) return failure('corrupt', 'Save has no list of chunks');
  return readParsed(data.hot, data.chunks, content, contentVersion);
}

/** The same for the parts as storage keeps them. */
export function readSaveParts(parts: SaveParts, content: Content, contentVersion?: string): SaveResult {
  let hot: unknown;
  const chunks: unknown[] = [];
  try {
    hot = JSON.parse(parts.hot);
    if (isObject(hot) && hot.version !== SAVE_VERSION) return oldVersion(hot.version);
    for (const text of parts.chunks) chunks.push(JSON.parse(text));
  } catch {
    return failure('corrupt', 'Save is not valid JSON');
  }
  return readParsed(hot, chunks, content, contentVersion);
}

function oldVersion(version: unknown): SaveResult {
  return failure('old_version', `Save has format version ${String(version)}, this game reads ${SAVE_VERSION}`);
}

function readParsed(hot: unknown, chunks: unknown[], content: Content, contentVersion: string | undefined): SaveResult {
  if (!isObject(hot)) return failure('corrupt', 'Save has no hot part');
  if (hot.version !== SAVE_VERSION) return oldVersion(hot.version);
  let state: GameState;
  try {
    const decoded = decodeCompact(hot.shapes, hot.state);
    if (!isObject(decoded)) throw new Error('state is not an object');
    state = decoded as unknown as GameState;
    if (!Array.isArray(state.archive) || state.archive.length !== 0) throw new Error('the hot part holds chunks');
    if (hot.archive !== chunks.length) throw new Error(`the hot part counts ${String(hot.archive)} chunks, the save has ${chunks.length}`);
    state.archive = chunks.map((c, i) => {
      if (!isObject(c) || c.version !== SAVE_VERSION || c.chunk !== i) throw new Error(`chunk ${i} is not chunk ${i} of this format`);
      const chunk = decodeCompact(c.shapes, c.data);
      if (!isObject(chunk)) throw new Error(`chunk ${i} is not an object`);
      return chunk as unknown as ArchiveChunk;
    });
    const problems = [...checkInvariants(state, content), ...archiveProblems(state, content)];
    if (problems.length > 0) {
      const changed = contentVersion !== undefined && hot.content !== contentVersion;
      return failure(changed ? 'content_changed' : 'corrupt', `Invalid save: ${problems.slice(0, 10).join('; ')}`);
    }
  } catch (error) {
    return failure('corrupt', `Invalid save: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: true, state };
}

/** The version of the content a save was made on (D-202); null when the text is not a save of this format. */
export function savedContentVersion(hotOrSave: string): string | null {
  try {
    const data: unknown = JSON.parse(hotOrSave);
    if (!isObject(data) || data.version !== SAVE_VERSION) return null;
    const hot = isObject(data.hot) ? data.hot : data;
    return typeof hot.content === 'string' ? hot.content : null;
  } catch {
    return null;
  }
}

export function deserialize(json: string, content: Content, contentVersion?: string): GameState {
  const result = readSave(json, content, contentVersion);
  if (!result.ok) throw new Error(result.message);
  return result.state;
}
