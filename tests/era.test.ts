import { describe, expect, it } from 'vitest';
import { conditionReport, WhenSchema } from '../src/core/condition-keys';
import { eraOf } from '../src/core/era/era';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { computeMetrics, flatten } from '../src/core/metrics';
import { runSim } from '../src/core/sim';
import type { Ctx } from '../src/core/state';
import { fromYmd } from '../src/core/time/calendar';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, loadOrThrow } from './fixtures/content';

const content = loadOrThrow([...BASE_FILES, ...readContentFiles('tests/fixtures/eras')]);
const bare = loadOrThrow(BASE_FILES);

function setup(day: number, c = content): { ctx: Ctx; report: (when: object) => ReturnType<typeof conditionReport> } {
  const state = newGame(1, c);
  state.day = day;
  const ctx = { state, content: c };
  const hero = getPlayer(state);
  const scope = { hero: hero.id, protagonist: hero.id };
  return { ctx, report: (when) => conditionReport(ctx, hero, WhenSchema.parse(when), scope) };
}

describe('era of a day', () => {
  it('follows the calendar year, without gaps', () => {
    const { ctx } = setup(0);
    const id = (y: number, m: number, d: number) => eraOf(ctx, fromYmd(y, m, d))?.id;
    expect(id(1700, 1, 1)).toBe('first');
    expect(id(1709, 12, 31)).toBe('first');
    expect(id(1710, 1, 1)).toBe('second');
    expect(id(1719, 12, 31)).toBe('second');
    expect(id(1720, 1, 1)).toBe('third');
  });

  it('goes on in the last era after its end', () => {
    const { ctx } = setup(0);
    expect(eraOf(ctx, fromYmd(2100, 6, 1))?.id).toBe('third');
    expect(eraOf(ctx, fromYmd(1709, 1, 1))).toEqual({ id: 'first', name: 'The First Age', from: 1700, to: 1709 });
    expect(eraOf(ctx, fromYmd(1800, 1, 1))?.to).toBeNull();
  });

  it('is null without eras in the content', () => {
    expect(eraOf(setup(0, bare).ctx, 0)).toBeNull();
  });
});

describe('conditions years and era', () => {
  it('years: the calendar year of today', () => {
    const { report } = setup(fromYmd(1715, 5, 1));
    expect(report({ years: { min: 1710 } }).met).toBe(true);
    expect(report({ years: { max: 1715 } }).met).toBe(true);
    expect(report({ years: { min: 1710, max: 1720 } }).met).toBe(true);
    expect(report({ years: { min: 1716 } })).toEqual({ met: false, reasons: ['From 1716'], hidden: false });
    expect(report({ years: { max: 1714 } }).reasons).toEqual(['Until 1714']);
  });

  it('era: today is in one of the eras, the reason names them', () => {
    const { report } = setup(fromYmd(1715, 5, 1));
    expect(report({ era: ['second'] }).met).toBe(true);
    expect(report({ era: ['first', 'second'] }).met).toBe(true);
    expect(report({ era: ['first'] }).reasons).toEqual(['Only in The First Age']);
    expect(report({ era: ['first', 'third'] }).reasons).toEqual(['Only in The First Age or The Third Age']);
  });

  it('era after the last one and in a game without eras', () => {
    expect(setup(fromYmd(1900, 1, 1)).report({ era: ['third'] }).met).toBe(true);
    expect(setup(0, bare).report({ era: ['first'] }).met).toBe(false);
  });

  it('the schema wants min or max, and min not above max', () => {
    expect(() => WhenSchema.parse({ years: {} })).toThrow();
    expect(() => WhenSchema.parse({ years: { min: 5, max: 4 } })).toThrow();
    expect(() => WhenSchema.parse({ era: [] })).toThrow();
  });

  it('does not spend randomness or change the state', () => {
    const { ctx, report } = setup(fromYmd(1715, 5, 1));
    const before = JSON.stringify(ctx.state);
    report({ era: ['first'], years: { min: 1800 } });
    expect(JSON.stringify(ctx.state)).toBe(before);
  });
});

describe('metrics by era', () => {
  const real = loadOrThrow(readContentFiles());

  it('are empty without content eras', () => {
    const { state } = runSim(bare, { seed: 3, years: 30 });
    expect(computeMetrics(state, bare).eras).toEqual([]);
    expect(computeMetrics(state).eras).toEqual([]);
  });

  it('count the heads by the era of their death', () => {
    const { state } = runSim(content, { seed: 3, years: 80 });
    const m = computeMetrics(state, content);
    expect(m.eras.map((e) => e.id)).toEqual(['first', 'second', 'third']);
    expect(m.eras.reduce((n, e) => n + e.heads, 0)).toBe(m.heads.ageAtDeath.n);
    expect(m.eras.every((e) => e.heads === e.ageAtDeath.n && e.heads === e.eventsPerYear.n)).toBe(true);
    const flat = flatten(m);
    expect(flat['eras.third.heads']).toBe(m.eras[2]?.heads);
    expect(flat).toHaveProperty('eras.first.ageAtDeath.median');
  });

  it('the real content has the first era 1700–1790', () => {
    const { state } = runSim(real, { seed: 1, years: 60 });
    const m = computeMetrics(state, real);
    expect(m.eras.map((e) => e.id)).toEqual(['age_of_reason']);
    expect(m.eras[0]?.heads).toBe(m.heads.ageAtDeath.n);
    expect(eraOf({ state, content: real }, fromYmd(1790, 12, 31))?.id).toBe('age_of_reason');
    expect(eraOf({ state, content: real }, fromYmd(1850, 1, 1))?.id).toBe('age_of_reason');
  }, 30_000);
});
