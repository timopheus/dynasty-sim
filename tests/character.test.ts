import { describe, expect, it } from 'vitest';
import { unmetConditions, WhenSchema } from '../src/core/condition-keys';
import { applyEffects } from '../src/core/effects';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { createCharacter } from '../src/core/lifecycle';
import { ageModifiers, fameWord, stats, statWord } from '../src/core/character/stats';
import { placeholderValues } from '../src/core/character/text';
import { renderText } from '../src/core/text/text';
import { entryText } from '../src/core/chronicle/log';
import { fixtureContent } from './fixtures/content';

function setup(seed = 1) {
  const content = fixtureContent();
  const state = newGame(seed, content);
  const ctx = { state, content };
  return { content, state, ctx, hero: getPlayer(state) };
}

describe('traits', () => {
  it('removes the opposite trait when a new one is gained and writes a chronicle line', () => {
    const { ctx, hero, state } = setup();
    hero.traits = ['proud'];
    applyEffects(ctx, hero, { traits: { add: ['humble'] } }, {});
    expect(hero.traits).toEqual(['humble']);
    const line = entryText(state.chronicle.at(-1)!);
    expect(state.chronicle.at(-1)?.kind).toBe('trait_change');
    expect(line).toMatch(/put pride aside, as (he|she) had to\./);
    expect(checkInvariants(state, ctx.content)).toEqual([]);
  });

  it('ignores a second education and never removes one', () => {
    const { ctx, hero } = setup();
    hero.traits = ['learned_2'];
    applyEffects(ctx, hero, { traits: { add: ['courtly_1'] } }, {});
    expect(hero.traits).toEqual(['learned_2']);
    applyEffects(ctx, hero, { traits: { remove: ['learned_2'] } }, {});
    expect(hero.traits).toEqual(['learned_2']);
  });

  it('adds and removes ordinary traits without a chronicle line for non-character traits', () => {
    const { ctx, hero, state } = setup();
    hero.traits = [];
    const lines = state.chronicle.length;
    applyEffects(ctx, hero, { traits: { add: ['coward'] } }, {});
    expect(hero.traits).toEqual(['coward']);
    expect(state.chronicle.length).toBe(lines);
    applyEffects(ctx, hero, { traits: { remove: ['coward'] } }, {});
    expect(hero.traits).toEqual([]);
  });

  it('flags contradictory traits and two educations in the invariants', () => {
    const { ctx, hero, state } = setup();
    hero.traits = ['proud', 'humble', 'learned_2', 'courtly_1'];
    const problems = checkInvariants(state, ctx.content).join('\n');
    expect(problems).toMatch(/opposite/);
    expect(problems).toMatch(/2 educations/);
  });
});

describe('stats', () => {
  it('sums base, traits, education and age, never below 0', () => {
    const { ctx, hero } = setup();
    hero.baseStats = { diplomacy: 5, martial: 5, stewardship: 5, intrigue: 5, learning: 5, prowess: 5 };
    hero.birthDay = ctx.state.day - 20 * 365; // 20 years old
    hero.traits = ['proud', 'strong', 'learned_2'];
    expect(stats(ctx, hero)).toEqual({ diplomacy: 4, martial: 6, stewardship: 5, intrigue: 5, learning: 9, prowess: 8 });
    hero.baseStats.diplomacy = 0;
    expect(stats(ctx, hero).diplomacy).toBe(0);
  });

  it('lowers Prowess after 40 and everything but Learning after 60', () => {
    expect(ageModifiers(40)).toEqual({});
    expect(ageModifiers(46)).toEqual({ prowess: -2 });
    const old = ageModifiers(66);
    expect(old.prowess).toBe(-10);
    expect(old.learning).toBeUndefined();
    expect(old.diplomacy).toBe(-2);
  });

  it('gives words from the scale', () => {
    const { content } = setup();
    expect([0, 3, 4, 7, 8, 11, 12, 16, 19, 20, 25].map((v) => statWord(content, v))).toEqual([
      'Wretched', 'Wretched', 'Poor', 'Poor', 'Average', 'Average', 'Good', 'Excellent', 'Excellent', 'Brilliant', 'Brilliant',
    ]);
  });

  it('shows fame in four steps', () => {
    const { content, hero } = setup();
    const words = [0, 1, 2, 3].map((f) => {
      hero.fame = f;
      return fameWord(content, hero);
    });
    expect(words).toEqual(['Private', 'Local', 'Realm', 'All']);
  });

  it('does not use randomness', () => {
    const { ctx, hero, state } = setup();
    const before = [...state.rng];
    stats(ctx, hero);
    expect(state.rng).toEqual(before);
  });
});

describe('sex', () => {
  it('fills pronouns for the character the name refers to', () => {
    const { state, hero } = setup();
    const t = '{name}: {he} {him} {his} {He} {His}';
    hero.sex = 'male';
    expect(renderText(t, hero, state.day)).toBe(`${hero.givenName} ${hero.surname}: he him his He His`);
    hero.sex = 'female';
    expect(renderText(t, hero, state.day)).toBe(`${hero.givenName} ${hero.surname}: she her her She Her`);
    expect(Object.keys(placeholderValues(hero, 0))).toContain('His');
  });

  it('checks the sex condition through the registry with a content reason', () => {
    const { ctx, hero } = setup();
    const when = WhenSchema.parse({ sex: 'male' });
    hero.sex = 'male';
    expect(unmetConditions(ctx, hero, when, {})).toEqual([]);
    hero.sex = 'female';
    expect(unmetConditions(ctx, hero, when, {})).toEqual(['Men only.']);
    expect(unmetConditions(ctx, hero, WhenSchema.parse({ sex: 'female' }), {})).toEqual([]);
    expect(unmetConditions(ctx, hero, WhenSchema.parse({}), {})).toEqual([]);
  });

  it('picks given names from the pool of the sex', () => {
    const content = fixtureContent({}, {});
    content.names = { ...content.names, given: { male: ['Adam'], female: ['Eve'] } };
    const state = newGame(3, content);
    const ctx = { state, content };
    for (let i = 0; i < 20; i++) {
      const c = createCharacter(ctx, { surname: 'X', age: { min: 20, max: 20 } });
      expect(c.givenName).toBe(c.sex === 'male' ? 'Adam' : 'Eve');
    }
  });

  it('makes 40-60% of 100 founders women', () => {
    const content = fixtureContent();
    let women = 0;
    for (let seed = 1; seed <= 100; seed++) if (getPlayer(newGame(seed, content)).sex === 'female') women += 1;
    expect(women).toBeGreaterThanOrEqual(40);
    expect(women).toBeLessThanOrEqual(60);
  });
});

describe('generation', () => {
  it('gives every new character stats and consistent traits', () => {
    const content = fixtureContent();
    const state = newGame(5, content);
    const ctx = { state, content };
    for (let i = 0; i < 50; i++) {
      const c = createCharacter(ctx, { surname: 'X', age: { min: 18, max: 30 } });
      expect(Object.values(c.baseStats)).toHaveLength(6);
      expect(c.traits.length).toBeGreaterThan(0);
    }
    expect(checkInvariants(state, content)).toEqual([]);
  });
});
