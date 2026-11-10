import { describe, expect, it } from 'vitest';
import { botCommand } from '../src/core/bot';
import type { Content } from '../src/core/content/schema';
import { eventView } from '../src/core/events/view';
import { apply, play, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { kill } from '../src/core/lifecycle';
import { entryText } from '../src/core/chronicle/log';
import { allChronicle } from '../src/core/archive/archive';
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

/** Lets time run until a scene waits for the player or the backstory is over (D-479: the years pass between scenes). */
function toScene(state: GameState, c: Content): void {
  while (state.backstory.running && state.pendingEvent === null && state.status === 'running') apply(state, c, { type: 'wait', days: 3650 });
}

/** Answers each scene with the first option the player may press, letting the years run, until the backstory is over. */
function playBackstory(state: GameState, c: Content, pickIndex = (n: number[]) => n[0] as number): string[] {
  const shown: string[] = [];
  toScene(state, c);
  while (state.backstory.running) {
    const view = eventView({ state, content: c });
    if (!view) throw new Error('backstory running without a scene');
    shown.push(view.eventId);
    play(state, c, { type: 'choose', option: pickIndex(view.options.filter((o) => o.available).map((o) => o.index)) });
    toScene(state, c);
  }
  return shown;
}

describe('the backstory of the first hero (D-167)', () => {
  it('shows the scenes by stage in their years, before the first action (D-479)', () => {
    const state = newGame(3, content);
    expect(getPlayer(state).birthDay).toBe(0);
    expect(state.day).toBe(0);
    toScene(state, content);
    expect(state.pendingEvent?.eventId).toBe('origin_scene');
    expect(ageYears(getPlayer(state).birthDay, state.day)).toBe(0);
    const shown = playBackstory(state, content);
    expect(shown).toEqual(['origin_scene', 'childhood_mentor', 'training_school']);
    expect(ageYears(getPlayer(state).birthDay, state.day)).toBe(16);
    expect(state.status).toBe('awaiting_action');
    expect(state.pendingEvent).toBeNull();
    expect(checkInvariants(state, content)).toEqual([]);
    const kinds = allChronicle(state).filter((e) => e.subject === getPlayer(state).id).map((e) => e.kind);
    expect(kinds[0]).toBe('start');
    expect(kinds.at(-1)).toBe('backstory_end');
    expect(allChronicle(state).some((e) => /was born in house|nowhere/.test(entryText(e)))).toBe(true);
    const out = state.day;
    play(state, content, { type: 'start', actionId: 'wait' });
    expect(state.day).toBeGreaterThan(out);
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
    toScene(state, noScenes);
    expect(state.backstory.running).toBe(false);
    expect(ageYears(hero.birthDay, state.day)).toBe(16);
    expect(hero.baseStats).toEqual(content.backstory!.base);
    expect(hero.traits).toEqual([]);
    // no costs in the childhood (D-480)
    expect(hero.money).toBe(content.settings.startMoney);
    expect(state.status).toBe('awaiting_action');
    const kinds = allChronicle(state).filter((e) => e.subject === hero.id).map((e) => e.kind);
    expect(kinds[0]).toBe('start');
    expect(kinds.at(-1)).toBe('backstory_end');
    expect(kinds.filter((k) => k !== 'backstory_fate').length).toBe(2);
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
      expect(state.circle.length).toBeGreaterThanOrEqual(content.population!.circle.min);
      toScene(state, content);
      while (state.backstory.running) {
        const pending = state.pendingEvent!;
        if (pending.eventId === 'childhood_mentor') {
          found += 1;
          expect(state.circle).toContain(pending.scope.mentor);
        }
        play(state, content, { type: 'choose', option: eventView({ state, content })!.options.find((o) => o.available)!.index });
        toScene(state, content);
      }
    }
    expect(found).toBe(12);
  });

  it('offers 2 of the 3 variants by chance and always the plain one; the rest are hidden', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const state = newGame(seed, content);
      toScene(state, content);
      expect(state.backstory.offered).toHaveLength(2);
      const view = eventView({ state, content })!;
      expect(view.options).toHaveLength(3);
      expect(view.options.every((o) => o.available)).toBe(true);
      expect(view.options.at(-1)!.index).toBe(3);
      state.backstory.offered.forEach((v) => seen.add(v));
    }
    expect([...seen].sort()).toEqual(['va', 'vb', 'vc']);
  });

  it('sets the direction by the answer and the size by chance; the line of going out names the real age', () => {
    const state = newGame(3, content);
    const hero = getPlayer(state);
    toScene(state, content);
    const first = eventView({ state, content })!.options[0]!.index;
    expect([0, 1, 2]).toContain(first);
    playBackstory(state, content);
    const s = stats({ state, content }, hero);
    expect(hero.traits).toContain('courtly_1');
    expect(Object.values(s).some((v) => v !== 5)).toBe(true);
    expect(entryText(state.chronicle.at(-1)!)).toContain(`aged ${ageYears(hero.birthDay, state.day)}`);
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
    expect(state.backstory.next).toBeNull();
    expect(state.chronicle.every((e) => e.day >= 0)).toBe(true);
    expect(state.pendingEvent).toBeNull();
    expect(state.status).toBe('awaiting_action');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('continues after a save in the middle of the backstory', () => {
    const a = newGame(7, content);
    toScene(a, content);
    const b = deserialize(serialize(a), content);
    expect(b).toEqual(a);
    for (let step = 0; step < 4 && a.backstory.running; step++) {
      const view = eventView({ state: a, content })!;
      const option = view.options.find((o) => o.available)!.index;
      play(a, content, { type: 'choose', option });
      play(b, content, { type: 'choose', option });
      toScene(a, content);
      toScene(b, content);
      expect(deserialize(serialize(a), content)).toEqual(a);
      expect(b).toEqual(a);
    }
    expect(a.backstory.running).toBe(false);
  });

  it('dates every line the day it is written: birth on day 0, the childhood in year 7, the school in year 15 (D-479)', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const state = newGame(seed, content);
      const hero = getPlayer(state);
      playBackstory(state, content);
      const birth = hero.birthDay;
      expect(birth).toBe(0);
      const mine = allChronicle(state).filter((e) => e.subject === hero.id);
      const yearOf = (re: RegExp) => toYmd(mine.find((e) => re.test(entryText(e)))!.day).year - toYmd(birth).year;
      expect(mine[0]!.kind).toBe('start');
      expect(mine[0]!.day).toBe(0);
      expect(yearOf(/was born in|nowhere/)).toBeLessThanOrEqual(1);
      expect(yearOf(/learned from|ran off|quiet year/)).toBeGreaterThanOrEqual(7);
      expect(yearOf(/learned from|ran off|quiet year/)).toBeLessThanOrEqual(8);
      expect(yearOf(/went to school/)).toBeGreaterThanOrEqual(15);
      expect(mine.at(-1)!.kind).toBe('backstory_end');
      expect(mine.at(-1)!.day).toBe(state.day);
      const days = allChronicle(state).map((e) => e.day);
      expect(days).toEqual([...days].sort((x, y) => x - y));
      expect(checkInvariants(state, content)).toEqual([]);
    }
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
  it('stats_roll stays in its range and in 0..20; years put the next scene off, 29 February falling to the 28th', () => {
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
    const birth = hero.birthDay;
    state.day = fromYmd(1704, 2, 29);
    state.backstory.notBefore = 0;
    applyBackstoryEffects(ctx, hero, { years: 1 }, {});
    expect(toYmd(state.backstory.notBefore)).toMatchObject({ year: 1705, month: 2, day: 28 });
    expect(hero.birthDay).toBe(birth);
    expect(shiftYears(fromYmd(1704, 2, 29), 1)).toBe(fromYmd(1705, 2, 28));
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
      toScene(state, real);
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

  // 40 seeds, not 100: on the clock each game lives sixteen years of the world (T.4)
  it('gives games different backstories: 40 seeds make 10 or more different chains', () => {
    const chains = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const state = newGame(seed, real);
      const rng = seedRng(seed, 1);
      const chain: string[] = [];
      while (state.backstory.running) {
        const cmd = state.status === 'running' ? { type: 'wait' as const, days: 3650 } : botCommand(state, real, rng);
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
  }, 120_000);
});
