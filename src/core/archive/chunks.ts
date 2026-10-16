import type { ChronicleEntry } from '../chronicle/log';
import type { Marriage } from '../family/family';
import type { RelationsArchive } from '../relations/archive';
import type { Character } from '../state';

/**
 * Archive part of the game state (D-234, D-312): chunks that never change once made. Rules of the simulation never
 * read them; pages, markdown, metrics, the summary of the house and the save do, through archive.ts. The part lives
 * apart from archive.ts so that state.ts (and so game.ts) does not reach the reading functions (tests/architecture).
 * The archive phase (phases.ts) makes the chunks.
 */
export interface ArchiveChunk {
  /** Day the chunk was made: the first day of a year the archive phase saw. */
  day: number;
  /** Chronicle entries older than the hot part keeps, oldest first. */
  chronicle: ChronicleEntry[];
  /** People long dead whom no hot data refers to (HOT_REFS of refs.ts), in the order they were created. */
  characters: Character[];
  /** Opinions, acquaintance, ended relations and secrets of those people only (relations/archive.ts). */
  relations: RelationsArchive;
  /** Marriage records of those people whose spouses are both dead (family/archive.ts, 4.5). */
  marriages: Marriage[];
}

export interface ArchiveState {
  /** In the order they were made: the number of a chunk is its position (D-312), not an id of `newId`. */
  archive: ArchiveChunk[];
  /** Calendar year the archive phase last looked at; null before the first look. */
  archiveYear: number | null;
}

export function initArchiveState(): ArchiveState {
  return { archive: [], archiveYear: null };
}
