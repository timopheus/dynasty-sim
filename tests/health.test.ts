import { describe, expect, it } from 'vitest';
import { actionAvailability } from '../src/core/actions/actions';
import { stats } from '../src/core/character/stats';
import { entryText } from '../src/core/chronicle/log';
import type { Content } from '../src/core/content/schema';
import { applyEffects } from '../src/core/effects';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { annualDeathChance, DAILY_DEATH_DENOMINATOR, dailyDeathChance, deathCause } from '../src/core/health/mortality';
import { deathPhase, HEALTH_WEEK, healthPhase } from '../src/core/health/phases';
import { checkInvariants } from '../src/core/invariants';
import type { Character, Ctx, GameState } from '../src/core/state';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, loadOrThrow } from './fixtures/content';

const content: Content = loadOrThrow([
  ...BASE_FILES.filter((f) => !f.path.endsWith('/health.yaml')),
  ...readContentFiles('tests/fixtures/health'),
]);

function setup(): { state: GameState; ctx: Ctx; hero: Character } {
  const state = newGame(1, content);
  return { state, ctx: { state, content }, hero: getPlayer(state) };
}

/** Moves to the next weekly day and runs the health phase on it. */
function nextWeek(ctx: Ctx): boolean {
  ctx.state.day = (Math.floor(ctx.state.day / HEALTH_WEEK) + 1) * HEALTH_WEEK;
  return healthPhase.run(ctx);
}

const stage = (hero: Character, id: string) => hero.conditions.find((c) => c.id === id)?.stage ?? null;
const lastText = (state: GameState) => entryText(state.chronicle.at(-1)!);

describe('conditions and stages', () => {
  it('start at the first stage through effects and are not doubled', () => {
    const { ctx, hero } = setup();
    applyEffects(ctx, hero, { wound: 'rot', disease: 'flu' });
    applyEffects(ctx, hero, { wound: 'rot' });
    expect(hero.conditions.map((c) => [c.id, c.stage])).toEqual([['rot', 'early'], ['flu', 'sick']]);
    expect(checkInvariants(ctx.state, content)).toEqual([]);
  });

  it('move on once a week after the stage has lasted minDays, with a line on the way to death', () => {
    const { state, ctx, hero } = setup();
    applyEffects(ctx, hero, { wound: 'rot' });
    nextWeek(ctx);
    expect(stage(hero, 'rot')).toBe('late');
    expect(state.chronicle.at(-1)?.level).toBe('chronicle'); // late is severe
    expect(lastText(state)).toBe("Anne Fixture's wound rotted.");
    state.day += 1;
    healthPhase.run(ctx); // not a weekly day: nothing is rolled
    expect(stage(hero, 'rot')).toBe('late');
  });

  it('heal after minDays and roll an outcome: injury trait, lost skill, chronicle line', () => {
    const { state, ctx, hero } = setup();
    hero.traits = ['steady'];
    applyEffects(ctx, hero, { wound: 'cut' });
    nextWeek(ctx); // day 7: only 7 of 10 days
    expect(stage(hero, 'cut')).toBe('fresh');
    nextWeek(ctx); // day 14
    expect(hero.conditions).toEqual([]);
    expect(hero.traits).toEqual(['maimed']);
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'health', level: 'chronicle' });
    expect(lastText(state)).toBe('Anne Fixture lost the use of a hand.');
  });

  it('give stage penalties to stats', () => {
    const { ctx, hero } = setup();
    const before = stats(ctx, hero);
    applyEffects(ctx, hero, { wound: 'cut' });
    const after = stats(ctx, hero);
    expect(before.prowess - after.prowess).toBe(Math.min(2, before.prowess));
    expect(before.martial - after.martial).toBe(Math.min(1, before.martial));
    expect(after.learning).toBe(before.learning);
  });

  it('heal effect: one stage back, recovery from the first, permanent conditions stay', () => {
    const { ctx, hero } = setup();
    applyEffects(ctx, hero, { wound: 'rot' });
    nextWeek(ctx);
    applyEffects(ctx, hero, { heal: 'rot' });
    expect(stage(hero, 'rot')).toBe('early');
    applyEffects(ctx, hero, { heal: 'all' });
    expect(stage(hero, 'rot')).toBeNull();
    applyEffects(ctx, hero, { wound: 'mortal', heal: 'all' });
    applyEffects(ctx, hero, { heal: 'all' });
    expect(stage(hero, 'mortal')).toBe('fatal');
  });
});

describe('old wound', () => {
  it('follows a healed gash and opens again, and heal closes it without removing it', () => {
    const { state, ctx, hero } = setup();
    applyEffects(ctx, hero, { wound: 'gash' });
    nextWeek(ctx);
    expect(hero.conditions.map((c) => [c.id, c.stage])).toEqual([['old_wound', 'closed']]);
    expect(lastText(state)).toBe("Anne Fixture's gash never quite healed.");
    nextWeek(ctx);
    expect(stage(hero, 'old_wound')).toBe('reopened');
    expect(lastText(state)).toBe("Anne Fixture's old wound opened.");
    applyEffects(ctx, hero, { heal: 'old_wound' });
    expect(stage(hero, 'old_wound')).toBe('closed');
    applyEffects(ctx, hero, { heal: 'old_wound' });
    expect(stage(hero, 'old_wound')).toBe('closed');
  });
});

describe('death', () => {
  it('comes from a stage that leads to death, with the cause and its chronicle line', () => {
    const { state, ctx, hero } = setup();
    applyEffects(ctx, hero, { wound: 'rot' });
    nextWeek(ctx); // late
    expect(nextWeek(ctx)).toBe(true);
    expect(hero.deathCause).toBe('rot_death');
    expect(state.chronicle.slice(-3).map((e) => e.kind)).toEqual(['death', 'death_cause', 'succession']);
    expect(entryText(state.chronicle.at(-2)!)).toBe(`Rot took ${hero.sex === 'male' ? 'him' : 'her'}.`);
    expect(state.playerId).not.toBe(hero.id);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('daily chance is the table row times the stage multipliers; the cause is the condition most to blame', () => {
    const { state, ctx, hero } = setup();
    expect(dailyDeathChance(ctx, hero)).toBe(1000);
    expect(deathCause(ctx, hero)).toBe('illness');
    applyEffects(ctx, hero, { wound: 'gash' });
    nextWeek(ctx);
    nextWeek(ctx); // old wound reopened: x3
    applyEffects(ctx, hero, { wound: 'rot' });
    nextWeek(ctx); // rot late: x5; the old wound stays reopened
    expect(dailyDeathChance(ctx, hero)).toBe(15000);
    expect(deathCause(ctx, hero)).toBe('rot_death');
    hero.birthDay = state.day - 70 * 366;
    hero.conditions = [];
    expect(dailyDeathChance(ctx, hero)).toBe(5000);
    expect(deathCause(ctx, hero)).toBe('old_age');
  });

  it('death phase kills with the cause of the table row when no condition is to blame', () => {
    const { state, hero } = setup();
    // Outside the schema on purpose: a row that makes death certain today.
    const certain: Content = { ...content, health: { ...content.health, mortality: [{ per100k: DAILY_DEATH_DENOMINATOR, cause: 'old_age' }] } };
    expect(deathPhase.run({ state, content: certain })).toBe(true);
    expect(hero.deathCause).toBe('old_age');
    expect(entryText(state.chronicle.at(-2)!)).toMatch(/^Old age took (him|her)\.$/);
  });

  it('keeps the annual chance for people far away by age', () => {
    expect(annualDeathChance(20)).toBe(1800);
    expect(annualDeathChance(65)).toBe(5600);
    expect(annualDeathChance(100)).toBe(40000);
  });
});

describe('onsets', () => {
  it('start a condition from the given age, with a line', () => {
    const { state, ctx, hero } = setup();
    nextWeek(ctx);
    expect(stage(hero, 'ague')).toBeNull();
    hero.birthDay = state.day - 61 * 366;
    nextWeek(ctx);
    expect(stage(hero, 'ague')).toBe('frail');
    expect(lastText(state)).toBe('Anne Fixture grew frail.');
  });
});

describe('rest and the road', () => {
  it('rest stops the way toward death, the road stops recovery', () => {
    const { state, ctx, hero } = setup();
    state.activeAction = { actionId: 'rest', endDay: state.day + 100 };
    applyEffects(ctx, hero, { wound: 'rot' });
    nextWeek(ctx);
    expect(stage(hero, 'rot')).toBe('early'); // rest: worse x0
    state.activeAction = { actionId: 'march', endDay: state.day + 100 };
    applyEffects(ctx, hero, { disease: 'flu' });
    nextWeek(ctx);
    expect(stage(hero, 'flu')).toBe('sick'); // road: better x0
    expect(stage(hero, 'rot')).toBe('late');
  });
});

describe('fit condition and interruption', () => {
  it('a severe stage closes `fit` actions with a reason and does not consume randomness', () => {
    const { state, ctx, hero } = setup();
    const reasons = () => actionAvailability(ctx).find((a) => a.action.id === 'march')?.unmet;
    expect(reasons()).toEqual([]);
    applyEffects(ctx, hero, { wound: 'rot' });
    nextWeek(ctx);
    const rng = [...state.rng];
    expect(reasons()).toEqual(['Too ill']);
    expect(state.rng).toEqual(rng);
  });

  it('a severe stage breaks off an action that is not rest, with a journal line', () => {
    const { state, ctx, hero } = setup();
    state.activeAction = { actionId: 'wait', endDay: state.day + 30 };
    applyEffects(ctx, hero, { wound: 'rot' });
    expect(nextWeek(ctx)).toBe(true);
    expect(state.activeAction).toBeNull();
    expect(state.status).toBe('awaiting_action');
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'interrupt', level: 'journal' });
    expect(lastText(state)).toBe('Anne Fixture took to bed.');

    state.activeAction = { actionId: 'rest', endDay: state.day + 30 };
    state.day += 1;
    expect(healthPhase.run(ctx)).toBe(false);
    expect(state.activeAction).not.toBeNull();
  });
});
