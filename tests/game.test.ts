import { describe, expect, it } from 'vitest';
import { ageYears } from '../src/core/calendar';
import { DAILY_DEATH_DENOMINATOR, dailyDeathChance, type Character } from '../src/core/character';
import type { Content } from '../src/core/content/schema';
import { apply, checkInvariants, deserialize, getPlayer, newGame, serialize, type GameState } from '../src/core/game';
import { fixtureContent, realContent } from './fixtures/content';

/** Starts an action and answers every event with the given option; returns [day, eventId] of each event. */
function runAction(state: GameState, content: Content, actionId: string, option = 1): [number, string][] {
  const events: [number, string][] = [];
  apply(state, content, { type: 'start', actionId });
  while (state.status === 'awaiting_choice' && state.pendingEvent) {
    events.push([state.day, state.pendingEvent.eventId]);
    apply(state, content, { type: 'choose', option });
  }
  return events;
}

describe('game loop', () => {
  it('starts with one living character and a chronicle entry', () => {
    const content = fixtureContent();
    const state = newGame(1, content);
    expect(state.characters).toHaveLength(1);
    expect(getPlayer(state).money).toBe(10);
    expect(state.chronicle[0]?.text).toMatch(/^Anne Fixture started at 20\.$/);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('runs an action for exactly its duration when no events fire', () => {
    const content = fixtureContent({ eventChancePer10k: 0 });
    const state = newGame(1, content);
    apply(state, content, { type: 'start', actionId: 'wait' });
    expect(state.day).toBe(30);
    expect(state.status).toBe('awaiting_action');
    expect(getPlayer(state).money).toBe(11);
    expect(state.chronicle.at(-1)?.text).toBe('Anne Fixture waited.');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('interrupts an action with an event and resumes it after the choice', () => {
    const content = fixtureContent({ eventChancePer10k: 10000 });
    const state = newGame(1, content);
    apply(state, content, { type: 'start', actionId: 'wait' });
    expect(state.status).toBe('awaiting_choice');
    expect(state.day).toBe(1);
    expect(state.activeAction?.endDay).toBe(30);

    // With the event always firing and no cooldowns, every day stops for a choice.
    while (state.status === 'awaiting_choice') {
      apply(state, content, { type: 'choose', option: 1 });
      expect(checkInvariants(state, content)).toEqual([]);
    }
    expect(state.day).toBe(30);
    expect(state.chronicle.filter((e) => e.kind === 'event')).toHaveLength(29);
    expect(state.chronicle.at(-1)?.kind).toBe('action');
  });

  it('rejects commands that do not fit the current status', () => {
    const content = fixtureContent({ eventChancePer10k: 10000 });
    const state = newGame(1, content);
    expect(() => apply(state, content, { type: 'choose', option: 0 })).toThrow();
    expect(() => apply(state, content, { type: 'start', actionId: 'nope' })).toThrow();
    apply(state, content, { type: 'start', actionId: 'wait' });
    expect(() => apply(state, content, { type: 'start', actionId: 'wait' })).toThrow();
    expect(() => apply(state, content, { type: 'choose', option: 5 })).toThrow();
  });

  it('kills a character at zero health and hands over to a placeholder heir', () => {
    const content = fixtureContent({ eventChancePer10k: 10000 });
    const state = newGame(1, content);
    apply(state, content, { type: 'start', actionId: 'wait' });
    apply(state, content, { type: 'choose', option: 0 }); // health -200 -> 0, death next day

    const [founder, heir] = state.characters;
    expect(founder?.deathDay).toBe(2);
    expect(state.playerId).toBe(heir?.id);
    expect(heir?.surname).toBe('Fixture');
    expect(heir?.money).toBe(10);
    expect(heir && ageYears(heir.birthDay, state.day)).toBe(18);
    expect(state.status).toBe('awaiting_action');
    expect(state.activeAction).toBeNull();
    expect(state.chronicle.slice(-2).map((e) => e.kind)).toEqual(['death', 'succession']);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('creates the first head of the house within the configured age range', () => {
    const content = realContent();
    const { min, max } = content.settings.startAge;
    for (let seed = 0; seed < 1000; seed++) {
      const founder = getPlayer(newGame(seed, content));
      const age = ageYears(founder.birthDay, 0);
      expect(age >= min && age <= max, `seed ${seed}: age ${age}`).toBe(true);
    }
  });
});

describe('event rules', () => {
  it('keeps the minimum gap between events', () => {
    const content = fixtureContent({ eventChancePer10k: 10000, minDaysBetweenEvents: 5 });
    const days = runAction(newGame(1, content), content, 'wait').map(([day]) => day);
    expect(days).toEqual([1, 6, 11, 16, 21, 26]);
  });

  it('does not repeat an event before its cooldown ends', () => {
    const content = fixtureContent({ eventChancePer10k: 10000, eventRepeatCooldownDays: 10 });
    expect(runAction(newGame(1, content), content, 'wait')).toEqual([
      [1, 'ping'],
      [11, 'ping'],
      [21, 'ping'],
    ]);
  });

  it('fires action-bound events only during their actions', () => {
    const content = fixtureContent({ eventChancePer10k: 10000 });
    const state = newGame(1, content);
    const duringWait = runAction(state, content, 'wait').map(([, id]) => id);
    expect(new Set(duringWait)).toEqual(new Set(['ping']));
    const duringRest = runAction(state, content, 'rest').map(([, id]) => id);
    expect(duringRest).toContain('rest_only');
  });
});

describe('mortality', () => {
  const person = (birthDay: number, health: number): Character => ({
    id: 'c1', givenName: 'A', surname: 'B', birthDay, deathDay: null, health, money: 0,
  });

  it('grows with age and poor health; zero health is certain death', () => {
    const chance = (ageYears: number, health: number) => dailyDeathChance(person(-ageYears * 366, health), 0);
    expect(chance(20, 100)).toBeGreaterThan(0);
    expect(chance(45, 100)).toBeGreaterThan(chance(20, 100));
    expect(chance(95, 100)).toBeGreaterThan(chance(45, 100));
    expect(chance(20, 30)).toBeGreaterThan(chance(20, 100));
    expect(chance(20, 10)).toBeGreaterThan(chance(20, 30));
    expect(chance(95, 1)).toBeLessThan(DAILY_DEATH_DENOMINATOR);
    expect(chance(20, 0)).toBe(DAILY_DEATH_DENOMINATOR);
  });
});

describe('saves', () => {
  it('continues identically after a JSON save and load mid-game', () => {
    const content = fixtureContent({ eventChancePer10k: 5000, minDaysBetweenEvents: 2 });
    const original = newGame(99, content);
    apply(original, content, { type: 'start', actionId: 'rest' });
    expect(original.status).toBe('awaiting_choice');
    const loaded = deserialize(serialize(original), content);
    expect(loaded).toEqual(original);

    const play = (s: typeof original) => {
      for (let i = 0; i < 50; i++) {
        apply(s, content, s.status === 'awaiting_choice' ? { type: 'choose', option: 1 } : { type: 'start', actionId: 'rest' });
      }
    };
    play(original);
    play(loaded);
    expect(serialize(loaded)).toBe(serialize(original));
  });

  it('refuses a broken save', () => {
    const content = fixtureContent();
    const state = newGame(1, content);
    expect(() => deserialize(JSON.stringify({ ...state, version: 2 }), content)).toThrow(/version/);
    expect(() => deserialize(JSON.stringify({ ...state, playerId: 'c404' }), content)).toThrow(/player/);
  });
});
