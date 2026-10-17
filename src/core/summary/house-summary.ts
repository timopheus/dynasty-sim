import { allChronicle, anyCharacter } from '../archive/archive';
import { fullName } from '../character/character';
import type { ChronicleEntry } from '../chronicle/log';
import type { Content } from '../content/schema';
import { statusName } from '../house/house';
import type { GameState } from '../state';
import type { TextPart } from '../text/text';
import { ageYears, formatDate, toYmd } from '../time/calendar';
import { takeSnapshot } from './phases';
import type { Snapshot } from './summary';
import { findTurns, type Turn, type TurnCause } from './turns';

/** One head of the house. */
export interface SummaryHead {
  id: string;
  name: string;
  /** Day they took over; day 0 for the founder. */
  from: number;
  /** Day they died; null for the head still living. */
  to: number | null;
  /** Full years in the seat, up to death or to the end of the game. */
  years: number;
  /** Null while alive. */
  ageAtDeath: number | null;
  cause: string | null;
  nickname: string | null;
}

/** A point of the history of the house: where a number was at its highest or lowest. */
export interface Extreme {
  day: number;
  head: string;
  value: number;
}

export type MilestoneKind = 'marriage' | 'status' | 'heirloom_gained' | 'heirloom_lost' | 'end';

export interface Milestone {
  day: number;
  kind: MilestoneKind;
  text: string;
}

/** The summary of the house (D-016, D-246, D-317): data for the screen of 4.17 and the file of the tools. */
export interface HouseSummary {
  /** Founder's surname. */
  house: string;
  startDay: number;
  endDay: number;
  ended: boolean;
  /** Full years from the start of the game. */
  years: number;
  /** Generations: the longest line of heads, each descending from the one before (a brother after a brother is the same generation). */
  generations: number;
  heads: SummaryHead[];
  /** Renown and status of the house at the start and at the end. */
  start: { renown: number; status: string | null };
  end: { renown: number; status: string | null };
  /** Money of the head: the best and the worst reading. */
  money: { peak: Extreme; low: Extreme } | null;
  /** Renown of the house: the best and the worst reading. */
  renown: { peak: Extreme; low: Extreme } | null;
  turns: Turn[];
  milestones: Milestone[];
}

function plain(parts: readonly TextPart[]): string {
  return parts.map((p) => (typeof p === 'string' ? p : p.name)).join('');
}

/** Heads are the subjects of "start" and "succession" lines, in order (as in the metrics). */
function headStarts(chronicle: readonly ChronicleEntry[]): { id: string; from: number }[] {
  const heads: { id: string; from: number }[] = [];
  for (const e of chronicle) {
    if ((e.kind === 'start' || e.kind === 'succession') && !heads.some((h) => h.id === e.subject)) {
      heads.push({ id: e.subject, from: e.kind === 'start' ? Math.max(e.day, 0) : e.day });
    }
  }
  return heads;
}

function extremes(readings: readonly Snapshot[], at: 2 | 4): { peak: Extreme; low: Extreme } | null {
  let peak: Snapshot | null = null;
  let low: Snapshot | null = null;
  for (const s of readings) {
    if (!peak || (s[at] as number) > (peak[at] as number)) peak = s;
    if (!low || (s[at] as number) < (low[at] as number)) low = s;
  }
  if (!peak || !low) return null;
  return { peak: { day: peak[0], head: peak[1], value: peak[at] as number }, low: { day: low[0], head: low[1], value: low[at] as number } };
}

function generationsOf(state: GameState, heads: readonly SummaryHead[]): number {
  const ids = new Set(heads.map((h) => h.id));
  const depth = new Map<string, number>();
  let best = 0;
  for (const h of heads) {
    let up = 0;
    const seen = new Set<string>();
    const walk = (id: string): void => {
      const c = anyCharacter(state, id);
      if (!c || seen.has(id)) return;
      seen.add(id);
      for (const p of [c.father, c.mother]) {
        if (!p) continue;
        if (ids.has(p) && depth.has(p)) up = Math.max(up, depth.get(p) as number);
        else walk(p);
      }
    };
    walk(h.id);
    depth.set(h.id, up + 1);
    best = Math.max(best, up + 1);
  }
  return best;
}

/**
 * The summary of the house from the chronicle, the snapshots and the records (D-317, D-396); reads the archive, so it
 * is for pages and tools only, never for the rules. Pure: no randomness, the state is not changed. Ambitions come with
 * stage 6.
 */
export function houseSummary(state: GameState, content: Content): HouseSummary {
  const chronicle = allChronicle(state);
  const starts = headStarts(chronicle);
  const hero = anyCharacter(state, starts[0]?.id ?? state.playerId);
  const houseRecords = state.houses.flatMap((h) => h.heads);
  const heads: SummaryHead[] = starts.flatMap((s) => {
    const c = anyCharacter(state, s.id);
    if (!c) return [];
    const to = c.deathDay;
    const stop = to ?? state.day;
    return [
      {
        id: c.id,
        name: fullName(c),
        from: s.from,
        to,
        years: Math.floor((stop - s.from) / 365),
        ageAtDeath: to === null ? null : ageYears(c.birthDay, to),
        cause: c.deathCause,
        nickname: houseRecords.find((h) => h.id === c.id)?.nickname ?? null,
      },
    ];
  });

  const last = state.snapshots.at(-1);
  const readings: Snapshot[] = last && last[0] === state.day ? state.snapshots : [...state.snapshots, takeSnapshot(state)];
  const first = readings[0];
  const final = readings.at(-1);

  const milestones: Milestone[] = [];
  for (const e of chronicle) {
    if (e.kind === 'marriage') milestones.push({ day: e.day, kind: 'marriage', text: plain(e.parts) });
    else if (e.kind === 'house_status') milestones.push({ day: e.day, kind: 'status', text: plain(e.parts) });
    else if (e.kind === 'house_end') milestones.push({ day: e.day, kind: 'end', text: plain(e.parts) });
  }
  for (const h of state.heirlooms) {
    milestones.push({ day: h.made, kind: 'heirloom_gained', text: h.origin });
    if (h.ended !== null) milestones.push({ day: h.ended, kind: 'heirloom_lost', text: `${h.name} was ${h.status}.` });
  }
  milestones.sort((a, b) => a.day - b.day);

  return {
    house: hero?.surname ?? '',
    startDay: 0,
    endDay: state.day,
    ended: state.status === 'ended',
    years: Math.floor(state.day / 365),
    heads,
    generations: generationsOf(state, heads),
    start: { renown: first?.[4] ?? 0, status: first?.[5] ?? null },
    end: { renown: final?.[4] ?? 0, status: final?.[5] ?? null },
    money: extremes(readings, 2),
    renown: extremes(readings, 4),
    turns: findTurns(state, readings),
    milestones,
  };
}

function causeText(state: GameState, content: Content, c: TurnCause): string {
  switch (c.kind) {
    case 'money':
      return `money ${c.from} → ${c.to}`;
    case 'fame':
      return `fame step ${c.from} → ${c.to}`;
    case 'renown':
      return `renown of the house ${c.from} → ${c.to}`;
    case 'status':
      return `status ${statusName(content, c.from)} → ${statusName(content, c.to)}`;
    case 'trait':
      return `trait: ${c.text}`;
    case 'relation':
      return `${c.started ? 'new' : 'ended'} ${c.relation} tie with ${nameOfPerson(state, c.other)}`;
  }
}

function nameOfPerson(state: GameState, id: string): string {
  const c = anyCharacter(state, id);
  return c ? fullName(c) : id;
}

function year(day: number): number {
  return toYmd(day).year;
}

/** The summary as Markdown, for `out/summary-seed<N>-<years>y.md` (tools/sim.ts) and for reading (D-317). */
export function summaryMarkdown(state: GameState, content: Content): string {
  const s = houseSummary(state, content);
  const name = (id: string): string => s.heads.find((h) => h.id === id)?.name ?? id;
  const lines: string[] = [
    `# Summary of the House of ${s.house}`,
    '',
    `Seed ${state.seed} · ${formatDate(s.startDay)} – ${formatDate(s.endDay)} · ${s.years} years, ${s.generations} generations, ${s.heads.length} heads${s.ended ? ' · the house has ended' : ''}`,
    '',
    `Renown: ${s.start.renown} → ${s.end.renown}. Status: ${statusName(content, s.start.status)} → ${statusName(content, s.end.status)}.`,
    '',
    '## Heads',
    '',
  ];
  for (const h of s.heads) {
    const born = h.to === null ? 'alive' : `died at ${h.ageAtDeath}, ${h.cause ?? 'unknown cause'}`;
    lines.push(`- **${h.name}**${h.nickname ? ` ${h.nickname}` : ''} — ${formatDate(h.from)}, ${h.years} ${h.years === 1 ? 'year' : 'years'} in the seat, ${born}`);
  }
  lines.push('', '## Peak and low', '');
  if (s.money) {
    lines.push(`- Money: peak ${s.money.peak.value} (${name(s.money.peak.head)}, ${year(s.money.peak.day)}), low ${s.money.low.value} (${name(s.money.low.head)}, ${year(s.money.low.day)})`);
  }
  if (s.renown) {
    lines.push(`- Renown: peak ${s.renown.peak.value} (${year(s.renown.peak.day)}), low ${s.renown.low.value} (${year(s.renown.low.day)})`);
  }
  lines.push('', '## Turns', '');
  if (s.turns.length === 0) lines.push('No choice turned the fortune of the house.');
  for (const t of s.turns) {
    lines.push(`- **${formatDate(t.entry.day)}** — ${plain(t.entry.parts)} ▸ — ${t.causes.map((c) => causeText(state, content, c)).join('; ')}`);
  }
  lines.push('', '## Milestones', '');
  if (s.milestones.length === 0) lines.push('None.');
  for (const m of s.milestones) lines.push(`- **${formatDate(m.day)}** — ${m.text}`);
  return `${lines.join('\n')}\n`;
}
