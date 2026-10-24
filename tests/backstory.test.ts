import { describe, expect, it } from 'vitest';
import { botCommand } from '../src/core/bot';
import type { Content } from '../src/core/content/schema';
import { eventView } from '../src/core/events/view';
import { play, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { kill } from '../src/core/lifecycle';
import { entryText } from '../src/core/chronicle/log';
import { seedRng } from '../src/core/rng';
import { deserialize, serialize } from '../src/core/save/save';
import { backstoryAfterChoice } from '../src/core/backstory/phases';
import { stats } from '../src/core/character/stats';
import type { GameState } from '../src/core/state';
import { ageYears, fromYmd, toYmd } from '../src/core/time/calendar';
import { applyBackstoryEffects, shiftYears } from '../src/core/backstory/effects';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, loadOrThrow, realContent } from './fixtures/content';

const content: Content = loadOrThrow([
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions'),
  ...readContentFiles('tests/fixtures/backstory'),
]);

/** Answers the pending scene with the first option the player may press, until the backstory is over. */
function playBackstory(state: GameState, c: Content, pickIndex = (n: number[]) => n[0] as number): string[] {
  const shown: string[] = [];
  while (state.backstory.running) {
    const view = eventView({ state, content: c });
    if (!view) throw new Error('backstory running without a scene');
    shown.push(view.eventId);
    play(state, c, { type: 'choose', option: pickIndex(view.options.filter((o) => o.available).map((o) => o.index)) });
  }
  return shown;
}

describe('the backstory of the first hero (D-167)', () => {
  it('shows the scenes by stage, before the first action, without time passing', () => {
    const state = newGame(3, content);
    expect(state.status).toBe('awaiting_choice');
    expect(state.activeAction).toBeNull();
    expect(state.pendingEvent?.eventId).toBe('origin_scene');
    expect(state.day).toBe(0);
    const shown = playBackstory(state, content);
    expect(shown).toEqual(['origin_scene', 'childhood_mentor', 'training_school']);
    expect(state.day).toBe(0);
    expect(state.status).toBe('awaiting_action');
    expect(state.pendingEvent).toBeNull();
    expect(checkInvariants(state, content)).toEqual([]);
    const kinds = state.chronicle.map((e) => e.kind);
    expect(kinds[0]).toBe('start');
    expect(kinds.at(-1)).toBe('backstory_end');
    expect(entryText(state.chronicle[1]!)).toMatch(/was born/);
    play(state, content, { type: 'start', actionId: 'wait' });
    expect(state.day).toBeGreaterThan(0);
  });

  it('never shows a scene twice and takes a stage with no scene at its word', () => {
    const state = newGame(4, content);
    const shown = playBackstory(state, content);
    expect(new Set(shown).size).toBe(shown.length);
    expect(state.backstory.played).toEqual(shown);
  });

  it('brings the founder to the neutral base: only the scenes give stats, traits, education, money', () => {
    const noScenes = { ...content, events: content.events.filter((e) => e.deck !== 'backstory') };
    const state = newGame(3, noScenes);
    const hero = getPlayer(state);
    expect(state.backstory.running).toBe(false);
    expect(hero.baseStats).toEqual(content.backstory!.base);
    expect(hero.traits).toEqual([]);
    expect(hero.money).toBe(content.settings.startMoney);
    expect(state.status).toBe('awaiting_action');
    expect(state.chronicle.map((e) => e.kind)).toEqual(['start', 'backstory_end']);
    expect(checkInvariants(state, noScenes)).toEqual([]);
  });

  it('keeps the old random founder when the content has no backstory', () => {
    const plain = { ...content, backstory: null, events: content.events.filter((e) => e.deck !== 'backstory') };
    const state = newGame(3, plain);
    expect(state.backstory.running).toBe(false);
    expect(state.status).toBe('awaiting_action');
    expect(state.chronicle.map((e) => e.kind)).toEqual(['start']);
  });

  it('fills the circle before the first scene, and the trace in the world is someone from it', () => {
    let found = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const state = newGame(seed, content);
      const people = state.characters.length;
      expect(state.circle.length).toBeGreaterThanOrEqual(content.population!.circle.min);
      const circle = [...state.circle];
      while (state.backstory.running) {
        const pending = state.pendingEvent!;
        if (pending.eventId === 'childhood_mentor') {
          found += 1;
          expect(circle).toContain(pending.scope.mentor);
        }
        play(state, content, { type: 'choose', option: eventView({ state, content })!.options.find((o) => o.available)!.index });
      }
      expect(state.characters.length).toBe(people);
    }
    expect(found).toBe(12);
  });

  it('offers 2 of the 3 variants by chance and always the plain one; the rest are hidden', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const state = newGame(seed, content);
      expect(state.backstory.offered).toHaveLength(2);
      const view = eventView({ state, content })!;
      expect(view.options).toHaveLength(3);
      expect(view.options.every((o) => o.available)).toBe(true);
      expect(view.options.at(-1)!.index).toBe(3);
      state.backstory.offered.forEach((v) => seen.add(v));
    }
    expect([...seen].sort()).toEqual(['va', 'vb', 'vc']);
  });

  it('sets the direction by the answer and the size by chance; age_years makes the hero older', () => {
    const state = newGame(3, content);
    const hero = getPlayer(state);
    const before = ageYears(hero.birthDay, state.day);
    const pickOffered = (indices: number[]) => indices[0] as number;
    const first = eventView({ state, content })!.options[0]!.index;
    expect([0, 1, 2]).toContain(first);
    playBackstory(state, content, pickOffered);
    const s = stats({ state, content }, hero);
    expect(hero.traits).toContain('courtly_1');
    expect(ageYears(hero.birthDay, state.day)).toBe(before + 1);
    expect(Object.values(s).some((v) => v !== 5)).toBe(true);
    expect(entryText(state.chronicle.at(-1)!)).toContain(`aged ${before + 1}`);
  });

  it('a heir does not live through the backstory', () => {
    const state = newGame(3, content);
    const ctx = { state, content };
    // The founder dies in the middle of it (not by a scene: only by what the test does): the heir starts no scene.
    const founder = getPlayer(state);
    kill(ctx, founder, 'old_age');
    expect(getPlayer(state).id).not.toBe(founder.id);
    backstoryAfterChoice(ctx);
    expect(state.backstory.running).toBe(false);
    expect(state.backstory.lines).toEqual([]);
    expect(state.chronicle.every((e) => e.day >= 0)).toBe(true);
    expect(state.pendingEvent).toBeNull();
    expect(state.status).toBe('awaiting_action');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('continues after a save in the middle of the backstory', () => {
    const a = newGame(7, content);
    const b = deserialize(serialize(a), content);
    expect(b).toEqual(a);
    for (let step = 0; step < 4 && a.backstory.running; step++) {
      const view = eventView({ state: a, content })!;
      const option = view.options.find((o) => o.available)!.index;
      play(a, content, { type: 'choose', option });
      play(b, content, { type: 'choose', option });
      expect(deserialize(serialize(a), content)).toEqual(a);
      expect(b).toEqual(a);
    }
    expect(a.backstory.running).toBe(false);
  });

  it('dates the lines by the age of the stage: birth, 7, 15, then the start of the game (D-324)', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const state = newGame(seed, content);
      const hero = getPlayer(state);
      playBackstory(state, content);
      expect(state.day).toBe(0);
      // the school added a year: the birthday the lines are dated by is the final one
      expect(ageYears(hero.birthDay, state.day)).toBe(21);
      const birth = hero.birthDay;
      const dayOf = (re: RegExp) => state.chronicle.find((e) => re.test(entryText(e)))!.day;
      expect(state.chronicle[0]!.kind).toBe('start');
      expect(state.chronicle[0]!.day).toBe(birth);
      expect(dayOf(/was born/)).toBe(birth);
      expect(dayOf(/learned from|ran off|quiet year/)).toBe(shiftYears(birth, 7));
      expect(toYmd(dayOf(/went to school/)).year).toBe(toYmd(birth).year + 15);
      expect(state.chronicle.at(-1)!.kind).toBe('backstory_end');
      expect(state.chronicle.at(-1)!.day).toBe(0);
      const days = state.chronicle.map((e) => e.day);
      expect(days).toEqual([...days].sort((a, b) => a - b));
      expect(state.backstory.lines).toEqual([]);
      expect(checkInvariants(state, content)).toEqual([]);
    }
  });

  it('dates the lines of a stage without an age at the start of the game', () => {
    const bs = content.backstory!;
    const undated = { ...content, backstory: { ...bs, stages: bs.stages.map((s) => (s.id === 'training' ? { id: s.id } : s)) } };
    const state = newGame(5, undated);
    playBackstory(state, undated);
    const school = state.chronicle.find((e) => /went to school/.test(entryText(e)))!;
    expect(school.day).toBe(0);
    expect(state.chronicle[0]!.day).toBe(getPlayer(state).birthDay);
    expect(checkInvariants(state, undated)).toEqual([]);
  });

  it('is the same for the same seed', () => {
    const run = (): string => {
      const state = newGame(9, content);
      playBackstory(state, content);
      return JSON.stringify(state.chronicle);
    };
    expect(run()).toBe(run());
  });
});

describe('effects of the scenes', () => {
  it('stats_roll stays in its range and in 0..20; age_years moves a 29 February birth to the 28th', () => {
    const state = newGame(3, content);
    const ctx = { state, content };
    const hero = getPlayer(state);
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      hero.baseStats.martial = 5;
      applyBackstoryEffects(ctx, hero, { stats_roll: { martial: { min: 1, max: 3 } } }, {});
      seen.add(hero.baseStats.martial);
    }
    expect([...seen].sort()).toEqual([6, 7, 8]);
    hero.baseStats.martial = 19;
    applyBackstoryEffects(ctx, hero, { stats_roll: { martial: { min: 3, max: 3 } } }, {});
    expect(hero.baseStats.martial).toBe(20);
    hero.birthDay = fromYmd(1684, 2, 29);
    applyBackstoryEffects(ctx, hero, { age_years: 1 }, {});
    expect(toYmd(hero.birthDay)).toMatchObject({ year: 1683, month: 2, day: 28 });
  });
});

describe('the real backstory', () => {
  const real = realContent();
  const scenes = real.events.filter((e) => e.deck === 'backstory');

  it('has 8-12 scenes on 4-5 stages, 2 or more on each stage after the origin (which is one scene, D-271)', () => {
    const stages = real.backstory!.stages;
    expect(stages.length).toBeGreaterThanOrEqual(4);
    expect(stages.length).toBeLessThanOrEqual(5);
    expect(scenes.length).toBeGreaterThanOrEqual(8);
    expect(scenes.length).toBeLessThanOrEqual(12);
    for (const stage of stages.slice(1)) expect(scenes.filter((s) => s.stage === stage.id).length, stage.id).toBeGreaterThanOrEqual(2);
    expect(real.settings.startAge.min).toBeGreaterThanOrEqual(16);
  });

  it('offers 3 origins by chance in every game, and shows exactly those three (D-167, D-188)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const state = newGame(seed, real);
      expect(state.backstory.offered).toHaveLength(3);
      const view = eventView({ state, content: real })!;
      expect(view.options).toHaveLength(3);
      expect(view.options.every((o) => o.available)).toBe(true);
      state.backstory.offered.forEach((v) => seen.add(v));
    }
    expect(seen.size).toBe(real.backstory!.stages[0]!.offer!.variants.length);
  });

  it('names a mood on every scene and on every outcome that is not neutral, and leaves people in the world', () => {
    for (const scene of scenes) expect(scene.mood, scene.id).toBeDefined();
    const withPeople = scenes.filter((s) => Object.keys(s.roles ?? {}).length > 0);
    expect(withPeople.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(withPeople)).toMatch(/opinion|relation/);
  });

  it('gives games different backstories: 100 seeds make 10 or more different chains', () => {
    const chains = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const state = newGame(seed, real);
      const rng = seedRng(seed, 1);
      const chain: string[] = [];
      while (state.backstory.running) {
        const cmd = botCommand(state, real, rng);
        if (cmd.type === 'choose') chain.push(`${state.pendingEvent!.eventId}:${cmd.option}`);
        play(state, real, cmd);
        expect(checkInvariants(state, real)).toEqual([]);
      }
      const hero = getPlayer(state);
      const age = ageYears(hero.birthDay, state.day);
      expect(age).toBeGreaterThanOrEqual(16);
      expect(age).toBeLessThanOrEqual(21);
      expect(hero.traits.filter((t) => real.traits.find((d) => d.id === t)?.category === 'education').length).toBeLessThanOrEqual(1);
      chains.add(chain.join('>'));
    }
    expect(chains.size).toBeGreaterThanOrEqual(10);
  });
});
