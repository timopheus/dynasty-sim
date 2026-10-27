import { describe, expect, it } from 'vitest';
import type { ChronicleEntry } from '../src/core/chronicle/log';
import { newGame } from '../src/core/game';
import { checkInvariants } from '../src/core/invariants';
import { computeMetrics } from '../src/core/metrics';
import { deserialize, serialize } from '../src/core/save/save';
import { runSim } from '../src/core/sim';
import type { GameState } from '../src/core/state';
import { houseSummary, summaryMarkdown } from '../src/core/summary/house-summary';
import { SUMMARY_RULES } from '../src/core/summary/rules';
import type { Snapshot } from '../src/core/summary/summary';
import { findTurns } from '../src/core/summary/turns';
import { fixtureContent, realContentWithHeirs } from './fixtures/content';

const content = fixtureContent();

/** A state far enough in the future that every window below is over. */
function lateState(): GameState {
  const state = newGame(3, content);
  state.day = 365 * 20;
  return state;
}

const DAY = 365;
const mark = (state: GameState, day: number, extra: Partial<ChronicleEntry> = {}): ChronicleEntry => {
  const e: ChronicleEntry = { day, subject: state.playerId, kind: 'event', level: 'chronicle', parts: ['A choice.'], mark: true, ...extra };
  state.chronicle.push(e);
  return e;
};
/** Yearly readings of the hero: money, fame and renown per year. */
const readings = (state: GameState, rows: [money: number, fame: number, renown: number][]): Snapshot[] =>
  rows.map(([money, fame, renown], i) => [i * DAY, state.playerId, money, fame, renown, null]);

describe('yearly snapshot (D-317)', () => {
  it('one reading per calendar year, in order, and the save keeps them', () => {
    const { state } = runSim(content, { seed: 2, years: 10 });
    const years = state.snapshots.map((s) => Math.floor(s[0] / DAY));
    expect(years.length).toBeGreaterThanOrEqual(10);
    expect(new Set(years).size).toBe(years.length);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
    expect(state.snapshots[0]?.[1]).toBeTypeOf('string');
    expect(checkInvariants(state, content)).toEqual([]);
    expect(deserialize(serialize(state), content).snapshots).toEqual(state.snapshots);
  });

  it('the invariant catches a snapshot out of order', () => {
    const state = lateState();
    state.snapshots = [[100, state.playerId, 0, 0, 0, null], [50, state.playerId, 0, 0, 0, null]];
    expect(checkInvariants(state, content).some((p) => /snapshot 1/.test(p))).toBe(true);
  });
});

describe('turns (D-246, D-317)', () => {
  const { turnMoneyMin, turnMoneyPercent } = SUMMARY_RULES;

  it('finds a turn when the money passes the absolute threshold, not just under it', () => {
    const state = lateState();
    const e = mark(state, 10);
    const base = 100_000;
    expect(findTurns(state, readings(state, [[base, 0, 0], [base, 0, 0], [base - turnMoneyMin + 1, 0, 0]]))).toEqual([]);
    const turns = findTurns(state, readings(state, [[base, 0, 0], [base, 0, 0], [base - turnMoneyMin, 0, 0]]));
    expect(turns.map((t) => t.entry)).toEqual([e]);
    expect(turns[0]?.causes[0]).toMatchObject({ kind: 'money', from: base, to: base - turnMoneyMin });
  });

  it('counts a large share of a small fortune and not a small share of a large one', () => {
    const state = lateState();
    mark(state, 10);
    const half = Math.ceil((turnMoneyPercent * turnMoneyMin) / 100);
    expect(findTurns(state, readings(state, [[turnMoneyMin, 0, 0], [turnMoneyMin, 0, 0], [turnMoneyMin + half, 0, 0]]))).toHaveLength(1);
    expect(findTurns(state, readings(state, [[turnMoneyMin, 0, 0], [turnMoneyMin, 0, 0], [turnMoneyMin + half - 1, 0, 0]]))).toEqual([]);
    expect(findTurns(state, readings(state, [[100_000, 0, 0], [100_000, 0, 0], [100_000 + turnMoneyMin - 1, 0, 0]]))).toEqual([]);
  });

  it('a choice without the mark, and a choice with its year not over, are no turns', () => {
    const state = lateState();
    mark(state, 10, { mark: undefined });
    const r = readings(state, [[0, 0, 0], [0, 0, 0], [1000, 0, 0]]);
    expect(findTurns(state, r)).toEqual([]);
    const fresh = lateState();
    mark(fresh, fresh.day - 10);
    expect(findTurns(fresh, [...readings(fresh, [[0, 0, 0]]), [fresh.day, fresh.playerId, 1000, 0, 0, null]])).toEqual([]);
  });

  it('fame, renown and status shifts count; a new head hides the money, not the renown', () => {
    const state = lateState();
    mark(state, 10);
    const fame = readings(state, [[0, 0, 0], [0, 0, 0], [0, SUMMARY_RULES.turnFameSteps, 0]]);
    expect(findTurns(state, fame)[0]?.causes).toEqual([{ kind: 'fame', from: 0, to: SUMMARY_RULES.turnFameSteps }]);
    const renown = readings(state, [[0, 0, 0], [0, 0, 0], [0, 0, SUMMARY_RULES.turnRenown]]);
    expect(findTurns(state, renown)[0]?.causes[0]).toMatchObject({ kind: 'renown' });
    const small = readings(state, [[0, 0, 0], [0, 0, 0], [0, 0, SUMMARY_RULES.turnRenown - 1]]);
    expect(findTurns(state, small)).toEqual([]);
    const other = readings(state, [[0, 0, 0], [0, 0, 0], [5000, 0, SUMMARY_RULES.turnRenown]]);
    (other[2] as Snapshot)[1] = 'c999';
    expect(findTurns(state, other)[0]?.causes.map((c) => c.kind)).toEqual(['renown']);
  });

  it('a trait gained and a tie begun within a year are turns; one past the year is not', () => {
    const state = lateState();
    const e = mark(state, 10);
    state.chronicle.push({ day: 40, subject: state.playerId, kind: 'trait_change', level: 'chronicle', parts: ['Became bold.'] });
    state.chronicle.push({ day: 10 + DAY + 1, subject: state.playerId, kind: 'trait_change', level: 'chronicle', parts: ['Late.'] });
    state.relations.push({ id: 'r1', kind: 'rival', a: state.playerId, b: 'c9', start: 60, end: null, endReason: null });
    const turns = findTurns(state, readings(state, [[0, 0, 0], [0, 0, 0], [0, 0, 0]]));
    expect(turns).toHaveLength(1);
    expect(turns[0]?.entry).toBe(e);
    expect(turns[0]?.causes.map((c) => c.kind)).toEqual(['trait', 'relation']);
    // A later choice takes over what happens after it; the first keeps nothing.
    const later = mark(state, 30);
    state.chronicle.pop();
    const at = state.chronicle.indexOf(e) + 1;
    state.chronicle.splice(at, 0, later);
    expect(findTurns(state, readings(state, [[0, 0, 0], [0, 0, 0], [0, 0, 0]])).map((t) => t.entry.day)).toEqual([30]);
    state.chronicle.splice(at, 1);
    state.relations[0]!.start = 10 + DAY + 1;
    state.chronicle.splice(at, 1);
    expect(findTurns(state, readings(state, [[0, 0, 0], [0, 0, 0], [0, 0, 0]]))).toEqual([]);
  });

  it('lists at most turnsMax, the heaviest, in the order of days', () => {
    const state = lateState();
    state.day = DAY * 40;
    for (let i = 0; i < 14; i++) mark(state, 20 + i * 2 * DAY);
    const rows: [number, number, number][] = [];
    for (let i = 0; i < 30; i++) rows.push([50 * i * i, 0, 0]);
    const turns = findTurns(state, readings(state, rows));
    expect(turns).toHaveLength(SUMMARY_RULES.turnsMax);
    expect(turns.map((t) => t.entry.day)).toEqual([...turns.map((t) => t.entry.day)].sort((a, b) => a - b));
    // The shifts grow with the years, so the heaviest are the last ten of the fourteen.
    expect(turns.map((t) => t.entry.day)).toEqual(Array.from({ length: 10 }, (_, i) => 20 + (i + 4) * 2 * DAY));
  });
});

describe('peak and low (D-317)', () => {
  it('the best and the worst reading of money and of renown, the earliest on a tie', () => {
    const state = lateState();
    state.snapshots = readings(state, [[10, 0, 2], [50, 0, 7], [-20, 0, -3], [50, 0, 7], [0, 0, 1]]);
    const s = houseSummary(state, content);
    expect(s.money).toEqual({ peak: { day: DAY, head: state.playerId, value: 50 }, low: { day: 2 * DAY, head: state.playerId, value: -20 } });
    expect(s.renown?.peak).toMatchObject({ day: DAY, value: 7 });
    expect(s.renown?.low).toMatchObject({ day: 2 * DAY, value: -3 });
    expect(s.start.renown).toBe(2);
  });
});

describe('the summary of a run with the archive (4.3, 4.14)', () => {
  it('builds heads, extremes, turns and milestones from the whole history, and writes it as Markdown', () => {
    // With the scaffolding of D-315: the test is about a summary over a long history with the archive, not about whether
    // seed 1 happens to keep an heir for 120 years (D-466 changed the course of that game).
    const real = realContentWithHeirs();
    const { state } = runSim(real, { seed: 1, years: 120 });
    expect(state.archive.length).toBeGreaterThan(0);
    const s = houseSummary(state, real);
    expect(s.heads.length).toBe(computeMetrics(state, real).heads.count);
    expect(s.years).toBe(120);
    expect(s.heads[0]?.from).toBe(0);
    expect(s.generations).toBeGreaterThan(0);
    expect(s.generations).toBeLessThanOrEqual(s.heads.length);
    expect(s.heads.filter((h) => h.to === null).length).toBeLessThanOrEqual(1);
    for (const h of s.heads.filter((x) => x.to !== null)) {
      expect(h.ageAtDeath).toBeGreaterThan(0);
      expect(h.cause).not.toBeNull();
    }
    expect(s.turns.length).toBeLessThanOrEqual(SUMMARY_RULES.turnsMax);
    expect(s.turns.every((t) => t.entry.mark === true && t.causes.length > 0)).toBe(true);
    expect(s.money?.peak.value).toBeGreaterThanOrEqual(s.money?.low.value ?? 0);
    const md = summaryMarkdown(state, real);
    expect(md).toMatch(/^# Summary of the House of /);
    expect(md).toContain('## Turns');
    expect(summaryMarkdown(state, real)).toBe(md);
  }, 60_000);
});
