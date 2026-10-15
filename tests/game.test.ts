import { describe, expect, it } from 'vitest';
import { apply, checkInvariants, deserialize, getPlayer, newGame, serialize } from '../src/core/game';
import { fixtureContent } from './fixtures/content';

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
    expect(state.status).toBe('awaiting_action');
    expect(state.activeAction).toBeNull();
    expect(state.chronicle.slice(-2).map((e) => e.kind)).toEqual(['death', 'succession']);
    expect(checkInvariants(state, content)).toEqual([]);
  });
});

describe('saves', () => {
  it('continues identically after a JSON save and load mid-game', () => {
    const content = fixtureContent({ eventChancePer10k: 3000, minDaysBetweenEvents: 2 });
    const original = newGame(99, content);
    apply(original, content, { type: 'start', actionId: 'rest' });
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
