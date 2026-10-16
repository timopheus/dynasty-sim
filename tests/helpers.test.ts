import { describe, expect, it } from 'vitest';
import { findCharacter, getPlayer } from '../src/core/helpers';
import { newGame } from '../src/core/game';
import { deserialize, serialize } from '../src/core/save/save';
import { characterById } from '../src/core/world/world';
import { realContent } from './fixtures/content';

describe('findCharacter: the index of characters by id (D-194)', () => {
  const content = realContent();

  it('finds every character and nobody else, also after new ones are appended', () => {
    const state = newGame(5, content);
    for (const c of state.characters) expect(findCharacter(state, c.id)).toBe(c);
    expect(findCharacter(state, 'c999999')).toBeNull();
    const copy = { ...getPlayer(state), id: `c${state.nextId}` };
    state.nextId += 1;
    state.characters.push(copy);
    expect(findCharacter(state, copy.id)).toBe(copy);
    expect(characterById(state, copy.id)).toBe(copy);
  });

  it('follows a loaded save and an array changed in place', () => {
    const state = newGame(5, content);
    const first = state.characters[1]!;
    expect(findCharacter(state, first.id)).toBe(first);
    const loaded = deserialize(serialize(state), content);
    expect(findCharacter(loaded, first.id)).toBe(loaded.characters[1]);
    // Not how the game changes the list (entities are never removed), but the lookup stays right.
    state.characters.reverse();
    expect(findCharacter(state, first.id)).toBe(first);
    state.characters.splice(0, 1);
    for (const c of state.characters) expect(findCharacter(state, c.id)).toBe(c);
  });
});
