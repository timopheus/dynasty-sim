import type { ChronicleEntry } from '../core/chronicle/log';
import { ownLine, type TextPart } from '../core/text/text';

/** Heads of the house: subjects of the "start" and "succession" lines. A line about anyone else at chronicle level is the circle's (◆). */
export function headIds(chronicle: readonly ChronicleEntry[]): Set<string> {
  return new Set(chronicle.filter((e) => e.kind === 'start' || e.kind === 'succession').map((e) => e.subject));
}

export interface EntryView {
  parts: TextPart[];
  /** ▸ the player's choice (D-130). */
  mark: boolean;
  /** ◆ a line about someone of the circle, not a head (D-019). */
  world: boolean;
}

/**
 * A line as the screen shows it. On the page of its own subject (`own`) the line has no subject: the name is cut
 * (`ownLine`, D-162).
 */
export function entryView(e: ChronicleEntry, own: string | null, heads: ReadonlySet<string>): EntryView {
  return {
    parts: own !== null && e.subject === own ? ownLine(e.parts, own) : e.parts,
    mark: e.mark === true,
    world: e.level === 'chronicle' && !heads.has(e.subject),
  };
}
