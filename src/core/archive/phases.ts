import type { Character, Ctx, DayPhase, GameState } from '../state';
import { relationsArchiveSize, relationsHeld, takeRelations } from '../relations/archive';
import { hotRefs } from '../refs';
import { fromYmd, toYmd } from '../time/calendar';
import { chunkProblems } from './check';
import type { ArchiveChunk } from './chunks';

/** Full years the hot part keeps: older chronicle and people dead longer go to the archive (D-312). */
export const HOT_YEARS = 10;

/**
 * Archive phase (D-312): on the first day of a year the phase sees (a stop earlier in the day does not skip the year),
 * it moves into a new chunk the chronicle older than HOT_YEARS full years and the people dead longer than that whom
 * no hot data refers to (HOT_REFS, closed over parents and the records of relations that stay), with their records
 * of relations. It spends no randomness and makes no ids, so the run stays the same. Never stops the day. Writes
 * chunks only; never reads them through archive.ts.
 */
export const archivePhase: DayPhase = {
  id: 'archive',
  run(ctx) {
    const { state } = ctx;
    const year = toYmd(state.day).year;
    if (state.archiveYear === year) return false;
    state.archiveYear = year;
    const chunk = takeChunk(ctx, fromYmd(year - HOT_YEARS, 1, 1));
    if (!chunk) return false;
    const hot = new Set(state.characters.map((c) => c.id));
    const own = new Set(chunk.characters.map((c) => c.id));
    const problems = chunkProblems(chunk, state.archive.length, ctx.content, (id) => hot.has(id) || own.has(id));
    if (problems.length > 0) throw new Error(`Bad archive chunk: ${problems.slice(0, 5).join('; ')}`);
    state.archive.push(chunk);
    return false;
  },
};

/** Moves what is older than `cutoff` out of the hot part into a chunk; null when there is nothing to move. */
function takeChunk(ctx: Ctx, cutoff: number): ArchiveChunk | null {
  const { state } = ctx;
  let old = 0;
  while (old < state.chronicle.length && (state.chronicle[old] as { day: number }).day < cutoff) old += 1;
  const chronicle = state.chronicle.slice(0, old);
  // The hot references are read with the old lines gone: what only they named may go.
  if (old > 0) state.chronicle = state.chronicle.slice(old);
  const refs = hotRefs(ctx);
  const leaving = new Set<string>();
  for (const c of state.characters) if (c.deathDay !== null && c.deathDay < cutoff && !refs.has(c.id)) leaving.add(c.id);
  closeOver(state, leaving);
  const characters: Character[] = [];
  if (leaving.size > 0) {
    const kept: Character[] = [];
    for (const c of state.characters) (leaving.has(c.id) ? characters : kept).push(c);
    // A new array: the index of findCharacter belongs to the old one (D-194).
    state.characters = kept;
  }
  const relations = takeRelations(state, leaving);
  if (chronicle.length === 0 && characters.length === 0 && relationsArchiveSize(relations) === 0) return null;
  return { day: state.day, chronicle, characters, relations };
}

/** Keeps hot whoever a person staying hot names as a parent, and whoever a record of relations staying hot names. */
function closeOver(state: GameState, leaving: Set<string>): void {
  for (let changed = true; changed && leaving.size > 0; ) {
    changed = false;
    for (const c of state.characters) {
      if (leaving.has(c.id)) continue;
      for (const parent of [c.father, c.mother]) if (parent !== null && leaving.delete(parent)) changed = true;
    }
    for (const id of relationsHeld(state, leaving)) if (leaving.delete(id)) changed = true;
  }
}
