import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import {
  annualDeathChance,
  DAILY_DEATH_DENOMINATOR,
  dailyDeathChance,
} from '../src/core/health/mortality';
import { fixtureContent } from './fixtures/content';

describe('mortality', () => {
  const content = fixtureContent();
  /** Daily death chance of a character of the given age and health on day 0. */
  const chance = (age: number, health: number) => {
    const state = newGame(1, content);
    const c = getPlayer(state);
    c.birthDay = -age * 366;
    c.health = health;
    return dailyDeathChance({ state, content }, c);
  };

  it('grows with age and poor health; zero health is certain death', () => {
    expect(chance(20, 100)).toBeGreaterThan(0);
    expect(chance(45, 100)).toBeGreaterThan(chance(20, 100));
    expect(chance(95, 100)).toBeGreaterThan(chance(45, 100));
    expect(chance(20, 30)).toBeGreaterThan(chance(20, 100));
    expect(chance(20, 10)).toBeGreaterThan(chance(20, 30));
    expect(chance(95, 1)).toBeLessThan(DAILY_DEATH_DENOMINATOR);
    expect(chance(20, 0)).toBe(DAILY_DEATH_DENOMINATOR);
  });

  it('gives the annual chance by age without multipliers', () => {
    expect(annualDeathChance(20)).toBe(1000);
    expect(annualDeathChance(65)).toBe(6000);
    expect(chance(20, 100)).toBe(annualDeathChance(20));
  });
});
