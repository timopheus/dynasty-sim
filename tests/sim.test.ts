import { describe, expect, it } from 'vitest';
import { chronicleMarkdown } from '../src/core/chronicle/markdown';
import { runSim } from '../src/core/sim';
import { realContent } from './fixtures/content';

describe('headless simulation', () => {
  const content = realContent();

  it('produces the same chronicle for the same seed', () => {
    const a = runSim(content, { seed: 42, years: 60 });
    const b = runSim(content, { seed: 42, years: 60 });
    expect(chronicleMarkdown(a.state)).toBe(chronicleMarkdown(b.state));
  }, 30_000);

  it('produces a different chronicle for a different seed', () => {
    const a = runSim(content, { seed: 42, years: 30 });
    const b = runSim(content, { seed: 43, years: 30 });
    expect(chronicleMarkdown(a.state)).not.toBe(chronicleMarkdown(b.state));
  }, 30_000);

  it('runs 20 seeds for 50 years without invariant violations', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { state, violations } = runSim(content, { seed, years: 50 });
      expect(violations, `seed ${seed}`).toEqual([]);
      expect(state.day).toBeGreaterThanOrEqual(18262); // 1 January 1750
    }
  }, 60_000); // with the hero's circle (2.5) and invariants after every command this takes ~15 s
});
