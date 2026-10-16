import { describe, expect, it } from 'vitest';
import type { Content } from '../src/core/content/schema';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/lifecycle';
import { RolesSchema } from '../src/core/roles/content';
import { anyCandidate, baseScope, canFillRoles, fillRoles } from '../src/core/roles/roles';
import type { Character, Ctx } from '../src/core/state';
import { fixtureContent } from './fixtures/content';

/** A game with three people in the circle: poor, rich and richer, in that order. */
function withCircle(content: Content): { ctx: Ctx; hero: Character; people: Character[] } {
  const state = newGame(1, content);
  const ctx = { state, content };
  const people = [5, 100, 200].map((money) => {
    const c = createCharacter(ctx, { surname: 'Circle', age: { min: 30, max: 30 } });
    c.money = money;
    state.circle.push(c.id);
    return c;
  });
  return { ctx, hero: getPlayer(state), people };
}

describe('roles, simplest form of 3.1', () => {
  const content = fixtureContent();

  it('takes the first person of the circle that fits `where`', () => {
    const { ctx, hero, people } = withCircle(content);
    const roles = RolesSchema.parse({ lender: { pick: 'circle', where: { money_min: 50 } } });
    const rng = [...ctx.state.rng];
    expect(fillRoles(ctx, roles, baseScope(hero, hero))).toEqual({ hero: hero.id, protagonist: hero.id, lender: people[1]!.id });
    expect(canFillRoles(ctx, roles, baseScope(hero, hero))).toBe(true);
    expect(ctx.state.rng).toEqual(rng); // no randomness
  });

  it('refuses when a role that is not optional has nobody, and leaves an optional one empty', () => {
    const { ctx, hero } = withCircle(content);
    const nobody = RolesSchema.parse({ rich: { pick: 'circle', where: { money_min: 1000 } } });
    expect(fillRoles(ctx, nobody, baseScope(hero, hero))).toBeNull();
    expect(canFillRoles(ctx, nobody, baseScope(hero, hero))).toBe(false);
    const optional = RolesSchema.parse({ rich: { pick: 'circle', where: { money_min: 1000 }, optional: true } });
    expect(fillRoles(ctx, optional, baseScope(hero, hero))).toEqual({ hero: hero.id, protagonist: hero.id });
  });

  it('gives one person at most one role', () => {
    const { ctx, hero, people } = withCircle(content);
    const roles = RolesSchema.parse({ a: { pick: 'circle', where: { money_min: 150 } }, b: { pick: 'circle', where: { money_min: 150 } } });
    expect(fillRoles(ctx, roles, baseScope(hero, hero))).toBeNull();
    const two = RolesSchema.parse({ a: { pick: 'circle', where: { money_min: 50 } }, b: { pick: 'circle', where: { money_min: 50 } } });
    expect(fillRoles(ctx, two, baseScope(hero, hero))).toMatchObject({ a: people[1]!.id, b: people[2]!.id });
  });

  it('keeps a given person while alive and in the circle', () => {
    const { ctx, hero, people } = withCircle(content);
    const roles = RolesSchema.parse({ rival: { pick: 'given' } });
    const given = { ...baseScope(hero, hero), rival: people[0]!.id };
    expect(fillRoles(ctx, roles, given)).toEqual(given);
    ctx.state.circle = ctx.state.circle.filter((id) => id !== people[0]!.id);
    expect(fillRoles(ctx, roles, given)).toBeNull();
  });

  it('anyCandidate looks for a fitting candidate without randomness', () => {
    const { ctx, hero } = withCircle(content);
    const role = RolesSchema.parse({ x: { pick: 'circle' } }).x!;
    expect(anyCandidate(ctx, 'x', role, { money_min: 150 }, baseScope(hero, hero))).toBe(true);
    expect(anyCandidate(ctx, 'x', role, { money_min: 1000 }, baseScope(hero, hero))).toBe(false);
  });
});
