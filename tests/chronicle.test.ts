import { describe, expect, it } from 'vitest';
import { entryText, log } from '../src/core/chronicle/log';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { fixtureContent } from './fixtures/content';

describe('chronicle log', () => {
  it('keeps text as parts with references fixed at the moment of writing', () => {
    const content = fixtureContent();
    const state = newGame(1, content);
    const hero = getPlayer(state);
    const entry = log({ state, content }, { subject: hero, kind: 'test', level: 'journal', template: '{name}, {age}, met {name}.', money: 40 });
    expect(entry.parts).toEqual([
      { id: hero.id, name: 'Anne Fixture' },
      ', 20, met ',
      { id: hero.id, name: 'Anne Fixture' },
      '.',
    ]);
    hero.givenName = 'Renamed';
    expect(entryText(entry)).toBe('Anne Fixture, 20, met Anne Fixture.');
    expect(checkInvariants(state, content)).toEqual([]);
    expect(Object.keys(entry).sort()).toEqual(['day', 'kind', 'level', 'parts', 'subject']); // money is not stored
  });

  it('reports a link to an unknown character', () => {
    const content = fixtureContent();
    const state = newGame(1, content);
    state.chronicle[0]?.parts.push({ id: 'c404', name: 'Nobody' });
    expect(checkInvariants(state, content)).toContain('chronicle links to unknown character c404');
  });
});
