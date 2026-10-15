/**
 * Run metrics (2.7): a pure function of the game state. It reads only fields
 * every stage has (characters, chronicle, money, day), so new module parts do
 * not break it. Wall-clock time is measured by tools/, not here.
 */
import { serialize } from '../save/save';
import type { GameState } from '../state';
import { ageYears } from '../time/calendar';

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
}

export interface RunMetrics {
  /** Days simulated. */
  days: number;
  heads: HeadsMetrics;
  /** Number of deaths by cause id, over everyone, sorted by id. */
  deathCauses: { cause: string; count: number }[];
  /** Chronicle entries of kind "action" and "event", any level (D-045). */
  actions: number;
  events: number;
  /** Events per completed action and per year, two decimals. */
  eventsPerAction: number;
  eventsPerYear: number;
  chronicle: { total: number; chronicleLevel: number; journalLevel: number };
  characters: { total: number; alive: number };
  money: { currentHead: number; atDeath: Dist };
  /** Size of the JSON save in UTF-8 bytes. */
  saveBytes: number;
}

const DAYS_PER_YEAR_X100 = 36525;

/** a / b to two decimals; 0 when b is 0. */
export function ratio(a: number, b: number): number {
  return b === 0 ? 0 : Math.round((a * 100) / b) / 100;
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

/** Heads of the house are the subjects of "start" and "succession" lines, in order. */
function headStarts(state: GameState): { id: string; startDay: number }[] {
  const heads: { id: string; startDay: number }[] = [];
  for (const e of state.chronicle) {
    if ((e.kind === 'start' || e.kind === 'succession') && !heads.some((h) => h.id === e.subject)) {
      heads.push({ id: e.subject, startDay: e.day });
    }
  }
  return heads;
}

export function computeMetrics(state: GameState): RunMetrics {
  const byId = new Map(state.characters.map((c) => [c.id, c]));
  const linesBySubject = new Map<string, { chronicle: number; journal: number }>();
  let actions = 0;
  let events = 0;
  let chronicleLevel = 0;
  for (const e of state.chronicle) {
    if (e.kind === 'action') actions += 1;
    if (e.kind === 'event') events += 1;
    if (e.level === 'chronicle') chronicleLevel += 1;
    const lines = linesBySubject.get(e.subject) ?? { chronicle: 0, journal: 0 };
    lines[e.level] += 1;
    linesBySubject.set(e.subject, lines);
  }

  const heads = headStarts(state);
  const dead = heads.flatMap((h) => {
    const c = byId.get(h.id);
    return c && c.deathDay !== null ? [{ c, deathDay: c.deathDay, startDay: h.startDay }] : [];
  });
  const lines = (id: string) => linesBySubject.get(id) ?? { chronicle: 0, journal: 0 };

  const causes = new Map<string, number>();
  for (const c of state.characters) {
    if (c.deathCause !== null) causes.set(c.deathCause, (causes.get(c.deathCause) ?? 0) + 1);
  }

  const player = byId.get(state.playerId);
  return {
    days: state.day,
    heads: {
      count: heads.length,
      ageAtDeath: dist(dead.map((d) => ageYears(d.c.birthDay, d.deathDay))),
      tenure: dist(dead.map((d) => ageYears(d.startDay, d.deathDay))),
      chronicleLinesPerLife: dist(dead.map((d) => lines(d.c.id).chronicle)),
      journalLinesPerLife: dist(dead.map((d) => lines(d.c.id).journal)),
    },
    deathCauses: [...causes.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([cause, count]) => ({ cause, count })),
    actions,
    events,
    eventsPerAction: ratio(events, actions),
    eventsPerYear: state.day === 0 ? 0 : Math.round((events * DAYS_PER_YEAR_X100) / state.day) / 100,
    chronicle: { total: state.chronicle.length, chronicleLevel, journalLevel: state.chronicle.length - chronicleLevel },
    characters: { total: state.characters.length, alive: state.characters.filter((c) => c.deathDay === null).length },
    money: { currentHead: player?.money ?? 0, atDeath: dist(dead.map((d) => d.c.money)) },
    saveBytes: utf8Bytes(serialize(state)),
  };
}
