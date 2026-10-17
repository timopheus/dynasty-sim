import { checkTraitHolding } from '../character/holding';
import type { Content } from '../content/schema';
import { kindOf } from '../entities/registry';
import { marriagesArchiveProblems } from '../family/archive';
import { isInt } from '../helpers';
import { relationsArchiveProblems } from '../relations/archive';
import type { GameState } from '../state';
import type { ArchiveChunk } from './chunks';

/**
 * Problems of one chunk on its own (D-312): checked when the archive phase makes it and when a save is loaded.
 * `known` says whether a person exists anywhere, the archive or the hot part. A link to another kind of entity (a house,
 * an heirloom) is checked by its kind in the hot state: those are never archived (D-311, D-425). Traits, reasons and
 * kinds come from the content: a save whose archive names what the content no longer has shows up here (D-202).
 */
export function chunkProblems(state: GameState, chunk: ArchiveChunk, index: number, content: Content, known: (id: string) => boolean): string[] {
  const at = `archive chunk ${index}`;
  const problems: string[] = [];
  if (!isInt(chunk.day)) problems.push(`${at}: day is not an integer`);
  let prev = -Infinity;
  for (const e of chunk.chronicle) {
    if (!isInt(e.day) || e.day < prev || e.day >= chunk.day) problems.push(`${at}: chronicle entry out of order on day ${String(e.day)}`);
    prev = e.day;
    if (!known(e.subject)) problems.push(`${at}: chronicle refers to unknown character ${e.subject}`);
    for (const p of e.parts) {
      if (typeof p === 'string') continue;
      const kind = kindOf(p.id);
      const person = kind === null || kind.prefix === 'c';
      const ok = person ? known(p.id) : kind.exists(state, p.id);
      if (!ok) problems.push(`${at}: chronicle links to unknown ${person ? 'character' : 'entity'} ${p.id}`);
    }
  }
  for (const c of chunk.characters) {
    if (c.deathDay === null || !isInt(c.deathDay) || c.deathDay >= chunk.day || c.deathCause === null) problems.push(`${at}: ${c.id} is not long dead`);
    for (const p of checkTraitHolding(content, c)) problems.push(`${at}: ${p}`);
  }
  for (const p of relationsArchiveProblems(chunk.relations, known, content)) problems.push(`${at}: ${p}`);
  for (const p of marriagesArchiveProblems(chunk.marriages, known)) problems.push(`${at}: ${p}`);
  return problems;
}
