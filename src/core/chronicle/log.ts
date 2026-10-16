import type { Character, Ctx, GameState, Invariant } from '../state';
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
  /** ▸ the player's choice that matters (D-130); present only when true. */
  mark?: true;
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
  /**
   * Change of the subject's money caused by what this line records, for selection by the size of
   * a sum (D-019, 2.6). Not stored in the entry.
   */
  money?: number;
  /** The line records a choice of the player that deserves a ▸ (an event option with `mark`). */
  mark?: boolean;
}

/**
 * Level the line is written at, or null if it is not stored at all (D-019, D-130). Thresholds are
 * in `content.chronicle`; without them the author's level stands.
 */
function selectLevel({ state, content }: Ctx, line: LogLine): ChronicleLevel | null {
  const sel = content.chronicle;
  if (!sel) return line.level;
  const { subject, kind } = line;
  if (subject.id !== state.playerId) {
    // People far from the hero leave no lines; their death is in deathDay and deathCause (D-063).
    if (!state.circle.includes(subject.id)) return null;
    const death = kind === 'death' || kind === 'death_cause';
    return death && subject.fame >= sel.famousFame ? 'chronicle' : 'journal';
  }
  if (line.level === 'journal') return 'journal';
  if (kind === 'action' || kind === 'event') {
    if (line.mark) return 'chronicle';
    const sum = Math.abs(line.money ?? 0);
    const before = subject.money - (line.money ?? 0);
    return sum >= sel.bigSum.min && sum * 100 >= Math.max(0, before) * sel.bigSum.percent ? 'chronicle' : 'journal';
  }
  if (kind === 'health' && repeatsRecent(state, subject.id, line, sel.repeatDays)) return 'journal';
  return line.level;
}

/** True if the same health line about the person is already in the chronicle within `days`. */
function repeatsRecent(state: GameState, subjectId: string, line: LogLine, days: number): boolean {
  const text = partsText(characterParts(line.template, line.subject, state.day));
  for (let i = state.chronicle.length - 1; i >= 0; i--) {
    const e = state.chronicle[i] as ChronicleEntry;
    if (e.day < state.day - days) break;
    if (e.subject === subjectId && e.kind === 'health' && e.level === 'chronicle' && entryText(e) === text) return true;
  }
  return false;
}

/**
 * The only way modules write to the chronicle (D-057). Selection (2.6) happens here: the level is
 * decided at the moment of writing, and lines about people far away are not stored (returns null).
 */
export function log(ctx: Ctx, line: LogLine): ChronicleEntry | null {
  const { state } = ctx;
  const level = selectLevel(ctx, line);
  if (level === null) return null;
  const entry: ChronicleEntry = {
    day: state.day,
    subject: line.subject.id,
    kind: line.kind,
    level,
    parts: characterParts(line.template, line.subject, state.day),
  };
  if (line.mark) entry.mark = true;
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
    if ('mark' in entry && entry.mark !== true) problems.push('chronicle entry has a mark that is not true');
    if (entry.level !== 'chronicle' && entry.level !== 'journal') problems.push(`chronicle entry has level ${String(entry.level)}`);
    for (const part of entry.parts) {
      if (typeof part !== 'string' && !ids.has(part.id)) problems.push(`chronicle links to unknown character ${part.id}`);
    }
  }
  return problems;
};
