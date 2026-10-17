/**
 * Run metrics (2.7): a pure function of the game state. It reads only fields
 * every stage has (characters, chronicle, money, day), so new module parts do
 * not break it. History is read through archive/ (hot part and archive, D-312).
 * Wall-clock time is measured by tools/, not here.
 */
import { allCharacters, allChronicle, anyCharacter } from '../archive/archive';
import { saveParts, SAVE_VERSION } from '../save/save';
import type { Content } from '../content/schema';
import { eraAt } from '../era/era';
import type { GameState } from '../state';
import { ageYears, toYmd } from '../time/calendar';

/** Spread of a list of numbers. `median` of an even count is the mean of the two middle values. */
export interface Dist {
  n: number;
  min: number;
  median: number;
  mean: number;
  max: number;
}

export interface HeadsMetrics {
  /** All heads of the house so far, the current one included. */
  count: number;
  /** Full years lived by heads who have died. */
  ageAtDeath: Dist;
  /** Full years between becoming head and dying, for heads who have died. */
  tenure: Dist;
  /** Chronicle-level lines about one head, for heads who have died (D-019). */
  chronicleLinesPerLife: Dist;
  /** Journal-level lines about one head, for heads who have died. */
  journalLinesPerLife: Dist;
  /** Lines with ▸ (a choice that mattered) about one head, for heads who have died (3.7). */
  marksPerLife: Dist;
}

/** Heads who died in one era (4.11, D-387): by the era of the day of death. */
export interface EraMetrics {
  id: string;
  heads: number;
  ageAtDeath: Dist;
  /** Events about one head per year of rule (at least one year), for heads who have died. */
  eventsPerYear: Dist;
}

export interface RunMetrics {
  /** Days simulated. */
  days: number;
  heads: HeadsMetrics;
  /** Heads who died, by the era of their death, in the order of the eras; empty while the content has no eras. */
  eras: EraMetrics[];
  /** Number of deaths by cause id, over everyone, sorted by id. */
  deathCauses: { cause: string; count: number }[];
  /** Chronicle entries of kind "action" and "event", any level (D-045). */
  actions: number;
  events: number;
  /** Events per completed action and per year, two decimals. */
  eventsPerAction: number;
  eventsPerYear: number;
  /** Events with a choice per action the narrator saw, short (under 60 days) and long (D-168, 3.7); two decimals. */
  eventsPerShortAction: number;
  eventsPerLongAction: number;
  /** Heavy events per year, and notices (events without a choice) started over the run. */
  heavyPerYear: number;
  notices: number;
  /** Events of people of the world per year, and the share of them whose line is stored (D-166, 3.9); two decimals. */
  npcEventsPerYear: number;
  npcStoredShare: number;
  chronicle: { total: number; chronicleLevel: number; journalLevel: number };
  characters: { total: number; alive: number };
  /** The most living characters in the state at once (yearly readings and the end, D-313). */
  livingMax: number;
  /** The house came to an end (status `ended`, D-315) and the calendar year it did; null while it goes on. */
  house: { ended: boolean; endYear: number | null };
  money: { currentHead: number; atDeath: Dist };
  /** Size of the whole JSON save (hot part and archive, as `serialize` writes it) in UTF-8 bytes. */
  saveBytes: number;
  /** Size of the hot part of the save, rewritten after every command (D-312), in UTF-8 bytes. */
  hotBytes: number;
  /** Size of the chunks of the archive, each written once (D-312), in UTF-8 bytes. */
  archiveBytes: number;
}

const DAYS_PER_YEAR_X100 = 36525;

/** a / b to two decimals; 0 when b is 0. */
export function ratio(a: number, b: number): number {
  return b === 0 ? 0 : Math.round((a * 100) / b) / 100;
}

/** Count per year of a run of `days` days, two decimals. */
function perYear(count: number, days: number): number {
  return days === 0 ? 0 : Math.round((count * DAYS_PER_YEAR_X100) / days) / 100;
}

export function dist(values: number[]): Dist {
  const n = values.length;
  if (n === 0) return { n: 0, min: 0, median: 0, mean: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  const sum = sorted.reduce((s, v) => s + v, 0);
  return { n, min: sorted[0] as number, median, mean: Math.round((sum * 10) / n) / 10, max: sorted[n - 1] as number };
}

/** Length of the string in UTF-8 bytes; the core has no TextEncoder. */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4; // a surrogate pair is one code point
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Heads of the house are the subjects of "start" and "succession" lines, in order. The founder rules from the start
 * of the game, day 0: the "start" line is dated at the birth by the backstory (D-324).
 */
function headStarts(state: GameState): { id: string; startDay: number }[] {
  const heads: { id: string; startDay: number }[] = [];
  for (const e of allChronicle(state)) {
    if ((e.kind === 'start' || e.kind === 'succession') && !heads.some((h) => h.id === e.subject)) {
      heads.push({ id: e.subject, startDay: e.kind === 'start' ? Math.max(e.day, 0) : e.day });
    }
  }
  return heads;
}

export function computeMetrics(state: GameState, content?: Content): RunMetrics {
  const chronicle = allChronicle(state);
  const characters = allCharacters(state);
  const linesBySubject = new Map<string, { chronicle: number; journal: number }>();
  const marksBySubject = new Map<string, number>();
  const eventsBySubject = new Map<string, number>();
  let actions = 0;
  let events = 0;
  let chronicleLevel = 0;
  for (const e of chronicle) {
    if (e.kind === 'action') actions += 1;
    if (e.kind === 'event') {
      events += 1;
      eventsBySubject.set(e.subject, (eventsBySubject.get(e.subject) ?? 0) + 1);
    }
    if (e.level === 'chronicle') chronicleLevel += 1;
    const lines = linesBySubject.get(e.subject) ?? { chronicle: 0, journal: 0 };
    lines[e.level] += 1;
    linesBySubject.set(e.subject, lines);
    if (e.mark) marksBySubject.set(e.subject, (marksBySubject.get(e.subject) ?? 0) + 1);
  }

  const heads = headStarts(state);
  const dead = heads.flatMap((h) => {
    const c = anyCharacter(state, h.id);
    return c && c.deathDay !== null ? [{ c, deathDay: c.deathDay, startDay: h.startDay }] : [];
  });
  const lines = (id: string) => linesBySubject.get(id) ?? { chronicle: 0, journal: 0 };

  const causes = new Map<string, number>();
  for (const c of characters) {
    if (c.deathCause !== null) causes.set(c.deathCause, (causes.get(c.deathCause) ?? 0) + 1);
  }

  const eras = (content?.eras?.list ?? []).map((era) => {
    const here = dead.filter((d) => eraAt(content as Content, d.deathDay)?.id === era.id);
    return {
      id: era.id,
      heads: here.length,
      ageAtDeath: dist(here.map((d) => ageYears(d.c.birthDay, d.deathDay))),
      eventsPerYear: dist(here.map((d) => ratio(eventsBySubject.get(d.c.id) ?? 0, Math.max(1, ageYears(d.startDay, d.deathDay))))),
    };
  });

  const parts = saveParts(state);
  const hotBytes = utf8Bytes(parts.hot);
  const archiveBytes = parts.chunks.reduce((sum, text) => sum + utf8Bytes(text), 0);
  // serialize() wraps the parts: {"version":V,"hot":…,"chunks":[…]} with commas between the chunks.
  const wrapper = `{"version":${SAVE_VERSION},"hot":,"chunks":[]}`.length + Math.max(0, parts.chunks.length - 1);
  const player = anyCharacter(state, state.playerId);
  const alive = characters.filter((c) => c.deathDay === null).length;
  const ended = state.status === 'ended';
  return {
    days: state.day,
    heads: {
      count: heads.length,
      ageAtDeath: dist(dead.map((d) => ageYears(d.c.birthDay, d.deathDay))),
      tenure: dist(dead.map((d) => ageYears(d.startDay, d.deathDay))),
      chronicleLinesPerLife: dist(dead.map((d) => lines(d.c.id).chronicle)),
      journalLinesPerLife: dist(dead.map((d) => lines(d.c.id).journal)),
      marksPerLife: dist(dead.map((d) => marksBySubject.get(d.c.id) ?? 0)),
    },
    eras,
    deathCauses: [...causes.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([cause, count]) => ({ cause, count })),
    actions,
    events,
    eventsPerAction: ratio(events, actions),
    eventsPerYear: perYear(events, state.day),
    eventsPerShortAction: ratio(state.narratorStats.shortEvents, state.narratorStats.shortActions),
    eventsPerLongAction: ratio(state.narratorStats.longEvents, state.narratorStats.longActions),
    heavyPerYear: perYear(state.narratorStats.heavy, state.day),
    notices: state.narratorStats.notices,
    npcEventsPerYear: perYear(state.narratorStats.npcEvents, state.day),
    npcStoredShare: ratio(state.narratorStats.npcStored, state.narratorStats.npcEvents),
    chronicle: { total: chronicle.length, chronicleLevel, journalLevel: chronicle.length - chronicleLevel },
    characters: { total: characters.length, alive },
    livingMax: Math.max(state.livingMax, alive),
    house: { ended, endYear: ended ? toYmd(state.day).year : null },
    money: { currentHead: player?.money ?? 0, atDeath: dist(dead.map((d) => d.c.money)) },
    saveBytes: hotBytes + archiveBytes + wrapper,
    hotBytes,
    archiveBytes,
  };
}
