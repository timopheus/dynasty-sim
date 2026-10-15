import type { Character, GameState, Invariant } from '../state';
import { characterParts, partsText, type TextPart } from '../text/text';
import { formatDate } from '../time/calendar';

/** "chronicle" lines are for the story, "journal" for everyday detail (D-057); 2.6 selects on top. */
export type ChronicleLevel = 'chronicle' | 'journal';

export interface ChronicleEntry {
  day: number;
  /** Id of the character the line is about. */
  subject: string;
  /** What happened, a lower_snake_case id such as "event" or "death". */
  kind: string;
  level: ChronicleLevel;
  /** Text as strings and references fixed at the moment of writing (D-020, D-057). */
  parts: TextPart[];
}

export interface ChronicleState {
  chronicle: ChronicleEntry[];
}

export function initChronicleState(): ChronicleState {
  return { chronicle: [] };
}

export interface LogLine {
  subject: Character;
  kind: string;
  level: ChronicleLevel;
  /** Content template; placeholders refer to the subject. */
  template: string;
}

/** The only way modules write to the chronicle (D-057). */
export function log(state: GameState, { subject, kind, level, template }: LogLine): ChronicleEntry {
  const entry: ChronicleEntry = { day: state.day, subject: subject.id, kind, level, parts: characterParts(template, subject, state.day) };
  state.chronicle.push(entry);
  return entry;
}

export function entryText(entry: ChronicleEntry): string {
  return partsText(entry.parts);
}

export const chronicleInvariants: Invariant = ({ state }) => {
  const problems: string[] = [];
  const ids = new Set(state.characters.map((c) => c.id));
  let prevDay = -Infinity;
  for (const entry of state.chronicle) {
    if (entry.day < prevDay) problems.push(`chronicle goes back in time at ${formatDate(entry.day)}`);
    prevDay = entry.day;
    if (!ids.has(entry.subject)) problems.push(`chronicle refers to unknown character ${entry.subject}`);
    if (entry.level !== 'chronicle' && entry.level !== 'journal') problems.push(`chronicle entry has level ${String(entry.level)}`);
    for (const part of entry.parts) {
      if (typeof part !== 'string' && !ids.has(part.id)) problems.push(`chronicle links to unknown character ${part.id}`);
    }
  }
  return problems;
};
