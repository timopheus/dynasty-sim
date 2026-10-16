import { describe, expect, it } from 'vitest';
import { apply, newGame } from '../src/core/game';
import { serialize } from '../src/core/save/save';
import { heroView } from '../src/ui/hero';
import { personHref, personIdFromHash } from '../src/ui/page';
import { isValidSeed } from '../src/core/rng';
import { SAVE_KEY, clearGame, loadGame, saveGame, seedFromSearch, startChoice, type KeyValueStore } from '../src/ui/storage';
import { fixtureContent, realContent } from './fixtures/content';

function fakeStore(limit = Infinity): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem(k, v) {
      if (v.length > limit) throw Object.assign(new Error('full'), { name: 'QuotaExceededError', code: 22 });
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
}

describe('autosave storage', () => {
  const content = fixtureContent();

  it('has nothing to load at first, then continues the saved game', () => {
    const store = fakeStore();
    expect(loadGame(store, content)).toEqual({ kind: 'none' });
    const state = newGame(7, content);
    apply(state, content, { type: 'start', actionId: 'rest' });
    expect(saveGame(store, state)).toEqual({ ok: true });
    expect(loadGame(store, content)).toEqual({ kind: 'loaded', state });
    clearGame(store);
    expect(loadGame(store, content)).toEqual({ kind: 'none' });
  });

  it('discards a save of another version or a broken one with a reason', () => {
    const store = fakeStore();
    store.setItem(SAVE_KEY, JSON.stringify({ ...newGame(1, content), version: 0 }));
    expect(loadGame(store, content)).toMatchObject({ kind: 'discarded', reason: 'old_version' });
    store.setItem(SAVE_KEY, '{oops');
    expect(loadGame(store, content)).toMatchObject({ kind: 'discarded', reason: 'corrupt' });
  });

  it('reports a full storage without throwing and keeps the previous save', () => {
    const state = newGame(3, content);
    const size = serialize(state).length;
    const store = fakeStore(size);
    expect(saveGame(store, state)).toEqual({ ok: true });
    const before = store.data.get(SAVE_KEY);
    const bigger = { ...state, day: state.day + 1, chronicle: [...state.chronicle, ...state.chronicle, { day: 1, subject: state.playerId, kind: 'x', level: 'journal' as const, parts: ['x'.repeat(size)] }] };
    expect(saveGame(store, bigger)).toMatchObject({ ok: false, reason: 'quota' });
    expect(store.data.get(SAVE_KEY)).toBe(before);
  });

  it('copes with missing or throwing storage', () => {
    const state = newGame(3, content);
    expect(saveGame(null, state)).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(loadGame(null, content)).toEqual({ kind: 'none' });
    const broken: KeyValueStore = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(saveGame(broken, state)).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(loadGame(broken, content)).toMatchObject({ kind: 'discarded', reason: 'unreadable' });
    expect(() => clearGame(broken)).not.toThrow();
  });
});

describe('hero view', () => {
  it('shows stats as words with numbers kept for hover, and traits apart from education', () => {
    const content = realContent();
    const state = newGame(5, content);
    const view = heroView(state, content);
    expect(view.stats).toHaveLength(6);
    for (const s of view.stats) {
      expect(s.word).not.toBe('');
      expect(Number.isInteger(s.value)).toBe(true);
    }
    expect(view.age).toBeGreaterThanOrEqual(18);
    expect(view.name).toContain(view.surname);
    expect(view.conditions).toBe('');
  });
});

describe('start choice', () => {
  const content = fixtureContent();
  const saved = { kind: 'loaded' as const, state: newGame(7, content) };

  it('reads the seed from the address only when it is there and valid', () => {
    for (const search of ['', '?', '?seed=', '?foo=1', '?seed=abc', '?seed=-1']) expect(seedFromSearch(search, isValidSeed)).toBeNull();
    expect(seedFromSearch('?seed=0', isValidSeed)).toBe(0);
    expect(seedFromSearch('?seed=7', isValidSeed)).toBe(7);
  });

  it('continues the saved game unless the address asks for another seed', () => {
    expect(startChoice(saved, null)).toBe('continue');
    expect(startChoice(saved, 7)).toBe('continue');
    expect(startChoice(saved, 8)).toBe('ask_replace');
    expect(startChoice({ kind: 'none' }, null)).toBe('new');
    expect(startChoice({ kind: 'discarded', reason: 'corrupt', message: '' }, 8)).toBe('new');
  });
});

describe('person page addresses', () => {
  it('round-trips an id through the address and rejects anything else', () => {
    expect(personIdFromHash(personHref('c12'))).toBe('c12');
    for (const bad of ['', '#', '#/person/', '#/person/c1/x', '#/person/<script>', '#person/c1']) expect(personIdFromHash(bad)).toBeNull();
  });
});
