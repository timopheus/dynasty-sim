import { describe, expect, it } from 'vitest';
import { botCommand } from '../src/core/bot';
import { conditionReport } from '../src/core/condition-keys';
import type { Content } from '../src/core/content/schema';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { seedRng } from '../src/core/rng';
import { willReasons } from '../src/core/succession/phases';
import { proposalAllowed, proposalOptions } from '../src/core/family/proposals';
import type { GameState } from '../src/core/state';
import { ageYears } from '../src/core/time/calendar';
import { realContent } from './fixtures/content';

/** T.2 (D-479): peers of a child hero, `age_near`, the pedigree of a newborn, no grown-up commands in the childhood. */
const real = realContent();
const clock: Content = { ...real, backstory: { ...real.backstory!, fromBirth: true } };

/** Lives the childhood on the clock until the hero is `age` years old (or the backstory ends). */
function liveTo(seed: number, age: number): GameState {
  const state = newGame(seed, clock);
  const bot = seedRng(seed, 99);
  let guard = 0;
  while (state.backstory.running && ageYears(getPlayer(state).birthDay, state.day) < age) {
    if (++guard > 20000) throw new Error('stuck');
    apply(state, clock, state.status === 'running' ? { type: 'wait', days: 1 } : botCommand(state, clock, bot));
  }
  return state;
}

const ageOf = (state: GameState, id: string): number => ageYears(state.characters.find((c) => c.id === id)!.birthDay, state.day);

describe('age_near', () => {
  it('a role with age_near: 3 at age 7 gets a person aged 4–10 on 10 seeds', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = liveTo(seed, 7);
      const hero = getPlayer(state);
      expect(ageYears(hero.birthDay, state.day), `seed ${seed}`).toBe(7);
      const ctx = { state, content: clock };
      const fit = state.circle
        .map((id) => state.characters.find((c) => c.id === id)!)
        .filter((c) => c.deathDay === null && conditionReport(ctx, c, { age_near: 3 }, { hero: hero.id, protagonist: hero.id }).met);
      expect(fit.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      for (const c of fit) expect(ageOf(state, c.id)).toBeGreaterThanOrEqual(4);
      for (const c of fit) expect(ageOf(state, c.id)).toBeLessThanOrEqual(10);
    }
  }, 120_000);
});

describe('the circle of a child hero', () => {
  it('holds children of his age, within the cap, and keeps them at 16', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const state = liveTo(seed, 16);
      const hero = getPlayer(state);
      const peers = state.circle.filter((id) => Math.abs(ageOf(state, id) - 16) <= 3);
      expect(peers.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(state.circle.length).toBeLessThanOrEqual(real.population!.circle.max);
      expect(hero.deathDay).toBeNull();
    }
  }, 120_000);
});

describe('the pedigree of the newborn founder', () => {
  it('both parents alive, no brother or sister of age 0, on 20 seeds', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = newGame(seed, clock);
      const hero = getPlayer(state);
      expect(ageYears(hero.birthDay, state.day)).toBe(0);
      const father = state.characters.find((c) => c.id === hero.father);
      const mother = state.characters.find((c) => c.id === hero.mother);
      expect(father, `seed ${seed}`).toBeDefined();
      expect(mother, `seed ${seed}`).toBeDefined();
      expect(father!.deathDay).toBeNull();
      expect(mother!.deathDay).toBeNull();
      const siblings = state.characters.filter((c) => c.id !== hero.id && c.father === hero.father && c.mother === hero.mother);
      for (const s of siblings) expect(ageYears(s.birthDay, state.day), `seed ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('no grown-up commands in the childhood', () => {
  it('the will and a proposal are refused while it lasts, even after 16', () => {
    const state = liveTo(3, 16);
    expect(state.backstory.running).toBe(true);
    const ctx = { state, content: clock };
    expect(willReasons(ctx)).toContain(real.succession!.texts.childhoodReason);
    expect(proposalOptions(ctx, state.circle[0]!)).toEqual([]);
    expect(proposalAllowed(ctx, getPlayer(state).id, state.circle[0]!)).toBe(false);
  }, 120_000);
});
