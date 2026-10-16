import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import { kill } from '../src/core/lifecycle';
import { compare, computeMetrics, dist, flatten, ratio, summarize, utf8Bytes } from '../src/core/metrics';
import { serialize } from '../src/core/save/save';
import { runSim } from '../src/core/sim';
import { getPlayer } from '../src/core/helpers';
import { ageYears } from '../src/core/time/calendar';
import { fixtureContent, fixtureNarrator } from './fixtures/content';

describe('metric helpers', () => {
  it('computes the spread of a list', () => {
    expect(dist([])).toEqual({ n: 0, min: 0, median: 0, mean: 0, max: 0 });
    expect(dist([5, 1, 3])).toEqual({ n: 3, min: 1, median: 3, mean: 3, max: 5 });
    expect(dist([1, 2, 4, 10])).toEqual({ n: 4, min: 1, median: 3, mean: 4.3, max: 10 });
  });

  it('divides to two decimals and survives a zero divisor', () => {
    expect(ratio(2, 3)).toBe(0.67);
    expect(ratio(5, 0)).toBe(0);
  });

  it('counts UTF-8 bytes like TextEncoder', () => {
    for (const text of ['', 'abc', 'é', 'Ж', '€', '😀 mixed é€']) {
      expect(utf8Bytes(text)).toBe(new TextEncoder().encode(text).length);
    }
  });
});

describe('computeMetrics', () => {
  const content = fixtureContent();

  it('describes a fresh game', () => {
    const state = newGame(1, content);
    const m = computeMetrics(state);
    expect(m.heads.count).toBe(1);
    expect(m.heads.ageAtDeath.n).toBe(0);
    expect(m.deathCauses).toEqual([]);
    expect(m.characters).toEqual({ total: 1, alive: 1 });
    expect(m.actions).toBe(0);
    expect(m.eventsPerYear).toBe(0);
    expect(m.saveBytes).toBe(utf8Bytes(serialize(state)));
  });

  it('counts a head who died and the heir who took over', () => {
    const state = newGame(1, content);
    const founder = getPlayer(state);
    state.day = 20000;
    founder.money = 700;
    kill({ state, content }, founder, 'natural');
    const m = computeMetrics(state);
    expect(m.heads.count).toBe(2);
    expect(m.heads.ageAtDeath).toMatchObject({ n: 1, median: ageYears(founder.birthDay, 20000) });
    expect(m.heads.tenure).toMatchObject({ n: 1, median: ageYears(0, 20000) });
    expect(m.deathCauses).toEqual([{ cause: 'natural', count: 1 }]);
    expect(m.characters).toEqual({ total: 2, alive: 1 });
    expect(m.money.currentHead).toBe(700);
    expect(m.money.atDeath).toMatchObject({ n: 1, median: 700 });
    // start line + death line about the founder; the heir's succession line is not his predecessor's life
    expect(m.heads.chronicleLinesPerLife.median).toBe(2);
  });

  it('is a pure function of the state and plain JSON', () => {
    const { state } = runSim(content, { seed: 7, years: 40 });
    const before = JSON.stringify(state);
    const a = computeMetrics(state);
    expect(JSON.stringify(state)).toBe(before);
    expect(computeMetrics(state)).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('is consistent with the chronicle after a run', () => {
    const { state, violations } = runSim(content, { seed: 3, years: 100 });
    expect(violations).toEqual([]);
    const m = computeMetrics(state);
    const count = (kind: string) => state.chronicle.filter((e) => e.kind === kind).length;
    expect(m.actions).toBe(count('action'));
    expect(m.events).toBe(count('event'));
    expect(m.heads.count).toBe(count('start') + count('succession'));
    expect(m.heads.ageAtDeath.n).toBe(m.heads.count - 1);
    expect(m.deathCauses.reduce((n, d) => n + d.count, 0)).toBe(count('death'));
    expect(m.chronicle.chronicleLevel + m.chronicle.journalLevel).toBe(state.chronicle.length);
    expect(m.eventsPerYear).toBeCloseTo((m.events * 365.25) / state.day, 1);
  });
});

describe('pace metrics (3.7)', () => {
  const content = fixtureNarrator({ eventChancePer10k: 2000, longActionChancePer10k: 2000, minDaysBetweenEvents: 1 });

  it('counts marks per head, heavy events, notices and events by the length of the action', () => {
    const state = newGame(1, content);
    const founder = getPlayer(state);
    state.chronicle.push({ day: 5, subject: founder.id, kind: 'event', level: 'chronicle', parts: ['A choice.'], mark: true });
    state.chronicle.push({ day: 6, subject: founder.id, kind: 'event', level: 'chronicle', parts: ['Another.'], mark: true });
    state.narratorStats = { shortActions: 4, shortEvents: 2, longActions: 2, longEvents: 5, heavy: 3, notices: 7, npcEvents: 0, npcStored: 0 };
    state.day = 36525;
    kill({ state, content }, founder, 'natural');
    const m = computeMetrics(state);
    expect(m.heads.marksPerLife.median).toBe(2);
    expect(m.eventsPerShortAction).toBe(0.5);
    expect(m.eventsPerLongAction).toBe(2.5);
    expect(m.heavyPerYear).toBe(0.03);
    expect(m.notices).toBe(7);
    expect(flatten(m)['heads.marksPerLife.median']).toBe(2);
  });

  it('agrees with the counters after a run', () => {
    const { state } = runSim(content, { seed: 2, years: 60 });
    const stats = state.narratorStats;
    const m = computeMetrics(state);
    // An event still waiting for the player is counted but not yet written.
    expect(stats.shortEvents + stats.longEvents - m.events).toBeLessThanOrEqual(1);
    expect(stats.shortEvents + stats.longEvents).toBeGreaterThanOrEqual(m.events);
    expect(m.eventsPerYear).toBeGreaterThan(0);
  }, 30000);
});

describe('summarize and compare', () => {
  const content = fixtureContent();
  const runs = [1, 2, 3].map((seed) => computeMetrics(runSim(content, { seed, years: 30 }).state));

  it('takes min, median and max over runs', () => {
    const s = summarize(runs);
    const counts = runs.map((r) => r.heads.count).sort((a, b) => a - b);
    expect(s['heads.count']).toEqual({ min: counts[0], median: counts[1], max: counts[2] });
    expect(Object.keys(s)).toEqual([...Object.keys(s)].sort());
  });

  it('counts a cause missing in a run as zero', () => {
    const [first, second] = runs;
    const a = { ...(first as (typeof runs)[0]), deathCauses: [{ cause: 'plague', count: 4 }] };
    const b = { ...(second as (typeof runs)[0]), deathCauses: [] };
    expect(flatten(a)['deaths.plague']).toBe(4);
    expect(summarize([a, b])['deaths.plague']).toEqual({ min: 0, median: 2, max: 4 });
  });

  it('lists differences of medians', () => {
    const a = { 'deaths.plague': { min: 0, median: 3, max: 3 }, x: { min: 1, median: 10, max: 20 }, y: { min: 0, median: 5, max: 5 }, only_a: { min: 1, median: 1, max: 1 } };
    const b = { x: { min: 1, median: 12.5, max: 20 }, y: { min: 0, median: 5, max: 5 } };
    expect(compare(a, b)).toEqual([
      { name: 'deaths.plague', before: 3, after: 0, delta: -3 },
      { name: 'only_a', before: 1, after: null, delta: null },
      { name: 'x', before: 10, after: 12.5, delta: 2.5 },
      { name: 'y', before: 5, after: 5, delta: 0 },
    ]);
    expect(compare(a, b, true).map((r) => r.name)).toEqual(['deaths.plague', 'only_a', 'x']);
  });
});

describe('npm run sim flags', () => {
  // Same path as in CLAUDE.md: npm's own header must not reach stdout.
  const sim = (...args: string[]) => execFileSync('npm', ['run', '-s', 'sim', '--', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const dir = mkdtempSync(join(tmpdir(), 'dynasty-metrics-'));

  it('--json prints only JSON, --runs N uses seeds seed..seed+N-1, --compare shows the difference', () => {
    const run = (seed: string, name: string) => {
      const json = sim('--years', '20', '--seed', seed, '--runs', '2', '--json');
      const report = JSON.parse(json) as { years: number; runs: { seed: number }[]; summary: Record<string, unknown> };
      expect(report.years).toBe(20);
      expect(report.runs.map((r) => r.seed)).toEqual([Number(seed), Number(seed) + 1]);
      expect(report.summary).toHaveProperty('heads.count');
      expect(report.summary).toHaveProperty('elapsedMs');
      const file = join(dir, name);
      writeFileSync(file, json);
      return file;
    };
    const a = run('1', 'a.json');
    const b = run('5', 'b.json');
    const table = sim('--compare', a, b);
    expect(table).toContain('B − A');
    expect(sim('--compare', a, a)).not.toMatch(/heads\.count/);
  }, 60_000);

  it('rejects a bad --runs and a missing second file', () => {
    expect(() => sim('--runs', '0')).toThrow();
    expect(() => sim('--compare', 'x.json')).toThrow();
    expect(() => sim('--years', '5', 'stray')).toThrow();
  }, 30_000);
});
