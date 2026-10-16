import { describe, expect, it } from 'vitest';
import { checkGates, gatesMarkdown, type Summary } from '../tools/gates-check';
import { GATES, type Gate } from '../tools/metrics-gates';

const s = (min: number, median: number, max: number): Summary => ({ min, median, max });
const good: Record<string, Summary> = {
  violations: s(0, 0, 0),
  saveBytes: s(1_300_000, 1_350_000, 1_400_000),
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

  it('fail on violations and on a save over 2 MB', () => {
    const st = statusOf({ ...good, violations: s(0, 0, 3), saveBytes: s(1, 2, 2_000_001) });
    expect(st.violations).toBe('fail');
    expect(st.saveBytes).toBe('fail');
  });

  it('only warn on a report-only metric', () => {
    const st = statusOf({ ...good, 'heads.ageAtDeath.median': s(30, 40, 50), elapsedMs: s(1, 2, 99_000) });
    expect(st['heads.ageAtDeath.median']).toBe('warn');
    expect(st.elapsedMs).toBe('warn');
    expect(Object.values(st)).not.toContain('fail');
  });

  it('fails on chronicle lines out of the corridor since stage 3 closed (D-205)', () => {
    expect(statusOf({ ...good, 'heads.chronicleLinesPerLife.median': s(55, 59, 62) })['heads.chronicleLinesPerLife.median']).toBe('fail');
  });

  it('a substituted corridor breaks the check, and switching the mode makes it fail', () => {
    const tight: Gate = { metric: 'eventsPerYear', label: 'x', stat: 'median', max: 5, mode: 'fail', ref: 'test' };
    expect(statusOf(good, [tight]).eventsPerYear).toBe('fail');
    expect(statusOf(good, [{ ...tight, mode: 'report' }]).eventsPerYear).toBe('warn');
  });

  it('a missing fail metric does not pass silently; a gate without corridor never fails', () => {
    const { saveBytes: _gone, ...rest } = good;
    expect(statusOf(rest).saveBytes).toBe('fail');
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
    expect(fails).toEqual(['heads.chronicleLinesPerLife.median', 'saveBytes', 'violations']);
  });
});
