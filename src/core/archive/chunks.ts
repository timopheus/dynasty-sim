import type { ChronicleEntry } from '../chronicle/log';
import type { Character } from '../state';

/**
 * Archive part of the game state (D-234, D-312): chunks that never change once made. Rules of the simulation never
 * read them; pages, markdown, metrics, the summary of the house and the save do, through archive.ts. The part lives
 * apart from archive.ts so that state.ts (and so game.ts) does not reach the reading functions (tests/architecture).
 * 4.1 wires the part; 4.3 makes the chunks (the archive phase) and adds what else goes there.
 */
export interface ArchiveChunk {
  /** Chronicle entries older than the hot part keeps, oldest first. */
  chronicle: ChronicleEntry[];
  /** People long dead whom no hot data refers to (HOT_REFS of refs.ts), in the order they were created. */
  characters: Character[];
}

export interface ArchiveState {
  /** In the order they were made: the number of a chunk is its position (D-312), not an id of `newId`. */
  archive: ArchiveChunk[];
}

export function initArchiveState(): ArchiveState {
  return { archive: [] };
}
