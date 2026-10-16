import { describe, expect, it } from 'vitest';
import { botCommand } from '../src/core/bot';
import { apply, newGame } from '../src/core/game';
import { SAVE_VERSION, deserialize, jsonProblems, readSave, serialize } from '../src/core/save/save';
import { seedRng } from '../src/core/rng';
import { fromYmd, START_YEAR } from '../src/core/time/calendar';
import { fixtureContent, realContent } from './fixtures/content';

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

  it('refuses to save a state that is not plain JSON', () => {
    const state = newGame(1, fixtureContent());
    expect(jsonProblems(state)).toEqual([]);
    expect(jsonProblems({ a: [1, undefined] })).toEqual(['state.a[1] is undefined']);
    expect(jsonProblems({ a: new Map() })).toEqual(['state.a is not a plain object']);
    expect(jsonProblems({ a: NaN })).toEqual(['state.a is NaN']);
    expect(() => serialize({ ...state, day: Infinity })).toThrow(/plain JSON/);
  });

  // Guard for every module (2.1): whatever a module keeps in the state must survive a save.
  it('gives the same state after a save and load after every command of a 20-year run', () => {
    const content = realContent();
    const seed = 3;
    const endDay = fromYmd(START_YEAR + 20, 1, 1);
    const straight = newGame(seed, content);
    let reloaded = deserialize(serialize(newGame(seed, content)), content);
    const botA = seedRng(seed, 1);
    const botB = seedRng(seed, 1);
    let steps = 0;
    while (straight.day < endDay) {
      apply(straight, content, botCommand(straight, content, botA));
      apply(reloaded, content, botCommand(reloaded, content, botB));
      reloaded = deserialize(serialize(reloaded), content);
      expect(reloaded).toEqual(straight);
      steps += 1;
    }
    expect(steps).toBeGreaterThan(100);
  });

  it('readSave refuses another version before looking at the rest, and never throws', () => {
    const content = fixtureContent();
    const state = newGame(1, content);
    expect(readSave(serialize(state), content)).toEqual({ ok: true, state });
    const old = readSave(JSON.stringify({ version: SAVE_VERSION - 1, anything: 'else' }), content);
    expect(old).toMatchObject({ ok: false, reason: 'old_version' });
    expect(readSave(JSON.stringify({ ...state, version: SAVE_VERSION + 1 }), content)).toMatchObject({ ok: false, reason: 'old_version' });
    expect(readSave(JSON.stringify({ no: 'version' }), content)).toMatchObject({ ok: false, reason: 'old_version' });
    for (const junk of ['', '{', 'null', '[]', '42', JSON.stringify({ version: SAVE_VERSION })]) {
      expect(readSave(junk, content)).toMatchObject({ ok: false, reason: 'corrupt' });
    }
    expect(readSave(JSON.stringify({ ...state, playerId: 'c404' }), content)).toMatchObject({ ok: false, reason: 'corrupt' });
  });
});
