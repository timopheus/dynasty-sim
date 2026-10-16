import { describe, expect, it } from 'vitest';
import { checkGates, gatesMarkdown, type Summary } from '../tools/gates-check';
import { GATES, type Gate } from '../tools/metrics-gates';

const s = (min: number, median: number, max: number): Summary => ({ min, median, max });
const good: Record<string, Summary> = {
  violations: s(0, 0, 0),
  hotBytes: s(60_000, 80_000, 120_000),
  saveBytes: s(1_300_000, 1_350_000, 2_400_000),
  'heads.chronicleLinesPerLife.median': s(30, 35, 40),
  'heads.ageAtDeath.median': s(48, 50, 53),
  'heads.count': s(9, 10, 11),
  eventsPerYear: s(7, 7.3, 7.7),
  elapsedMs: s(20_000, 23_000, 25_000),
};
const statusOf = (summary: Record<string, Summary>, gates: Gate[] = GATES) => Object.fromEntries(checkGates(summary, gates).map((r) => [r.gate.metric, r.status]));

describe('metric gates', () => {
  it('pass on good numbers', () => {
    expect(Object.values(statusOf(good)).every((x) => x === 'ok')).toBe(true);
  });

  it('fail on violations and on a hot part over 300 KB; the whole save is only reported (D-337)', () => {
    const st = statusOf({ ...good, violations: s(0, 0, 3), hotBytes: s(1, 2, 300_001) });
    expect(st.violations).toBe('fail');
    expect(st.hotBytes).toBe('fail');
    expect(statusOf({ ...good, hotBytes: s(1, 2, 300_000) }).hotBytes).toBe('ok');
    expect(statusOf({ ...good, saveBytes: s(1, 2, 9_000_000) }).saveBytes).toBe('ok');
  });

  it('only warn on a report-only metric', () => {
    const st = statusOf({ ...good, 'heads.ageAtDeath.median': s(30, 40, 50), elapsedMs: s(1, 2, 99_000) });
    expect(st['heads.ageAtDeath.median']).toBe('warn');
    expect(st.elapsedMs).toBe('warn');
    expect(Object.values(st)).not.toContain('fail');
  });

  it('fails on chronicle lines out of the corridor 25–50 (D-205; widened for families by D-318)', () => {
    expect(statusOf({ ...good, 'heads.chronicleLinesPerLife.median': s(40, 48, 52) })['heads.chronicleLinesPerLife.median']).toBe('ok');
    expect(statusOf({ ...good, 'heads.chronicleLinesPerLife.median': s(48, 51, 55) })['heads.chronicleLinesPerLife.median']).toBe('fail');
    expect(statusOf({ ...good, 'heads.chronicleLinesPerLife.median': s(55, 59, 62) })['heads.chronicleLinesPerLife.median']).toBe('fail');
    expect(statusOf({ ...good, 'heads.chronicleLinesPerLife.median': s(10, 20, 30) })['heads.chronicleLinesPerLife.median']).toBe('fail');
  });

  it('a substituted corridor breaks the check, and switching the mode makes it fail', () => {
    const tight: Gate = { metric: 'eventsPerYear', label: 'x', stat: 'median', max: 5, mode: 'fail', ref: 'test' };
    expect(statusOf(good, [tight]).eventsPerYear).toBe('fail');
    expect(statusOf(good, [{ ...tight, mode: 'report' }]).eventsPerYear).toBe('warn');
  });

  it('a missing fail metric does not pass silently; a gate without corridor never fails', () => {
    const { hotBytes: _gone, ...rest } = good;
    expect(statusOf(rest).hotBytes).toBe('fail');
    expect(statusOf({}, [{ metric: 'a', label: 'a', stat: 'max', mode: 'fail', ref: 't' }]).a).toBe('ok');
  });

  it('renders a table row with an icon per gate', () => {
    const md = gatesMarkdown(checkGates({ ...good, violations: s(0, 0, 1) }, GATES), 'T');
    expect(md).toContain('| metric | min | median | max |');
    expect(md).toContain('❌');
    expect(md).toContain('✅');
  });

  it('keeps D-203 mandatory gates in the config', () => {
    const fails = GATES.filter((g) => g.mode === 'fail').map((g) => g.metric).sort();
    expect(fails).toEqual(['heads.chronicleLinesPerLife.median', 'hotBytes', 'violations']);
  });
});
