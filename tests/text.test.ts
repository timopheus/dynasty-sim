import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/lifecycle';
import { checkEventTemplate } from '../src/core/text/check';
import { renderTemplate } from '../src/core/text/render';
import { fixtureContent } from './fixtures/content';

describe('event texts with roles, simplest form of 3.1', () => {
  it('renderTemplate puts a reference to the role and its pronouns', () => {
    const content = fixtureContent();
    const state = newGame(1, content);
    const ctx = { state, content };
    const hero = getPlayer(state);
    const friend = createCharacter(ctx, { surname: 'Friend', age: { min: 40, max: 40 } });
    const scope = { hero: hero.id, protagonist: hero.id, friend: friend.id };
    const he = friend.sex === 'male' ? 'he' : 'she';
    const His = friend.sex === 'male' ? 'His' : 'Her';
    const heroName = { id: hero.id, name: `${hero.givenName} ${hero.surname}` };
    const friendName = { id: friend.id, name: `${friend.givenName} ${friend.surname}` };
    expect(renderTemplate(ctx, '{name} met {friend}; {friend.he} was {friend.age}. {friend.His} hand, {hero}.', scope, 0, 'text')).toEqual([
      heroName,
      ' met ',
      friendName,
      `; ${he} was 40. ${His} hand, `,
      heroName,
      '.',
    ]);
    expect(() => renderTemplate(ctx, '{nobody}', scope, 0, 'text')).toThrow(/nobody/);
  });

  it('checkEventTemplate knows the roles of the event', () => {
    const env = { roles: ['friend'] };
    expect(checkEventTemplate('{name} met {friend} and {friend.his} {protagonist.he} {hero}.', env)).toBeNull();
    expect(checkEventTemplate('{nobody}', env)).toMatch(/unknown placeholder \{nobody\}/);
    expect(checkEventTemplate('{friend.wife}', env)).toMatch(/unknown field/);
    expect(checkEventTemplate('{friend.name}', env)).toMatch(/unknown field/);
    expect(checkEventTemplate('{friend', env)).toMatch(/unbalanced/);
  });
});
