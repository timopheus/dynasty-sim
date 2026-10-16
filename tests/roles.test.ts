import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/core/content/load';
import type { Content } from '../src/core/content/schema';
import { conditionReport } from '../src/core/condition-keys';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/lifecycle';
import { introduce } from '../src/core/relations/acquaintance';
import { startRelation } from '../src/core/relations/links';
import { checkRoles, RolesSchema } from '../src/core/roles/content';
import { anyCandidate, baseScope, canFillRoles, fillRoles } from '../src/core/roles/roles';
import type { Character, Ctx } from '../src/core/state';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, loadOrThrow } from './fixtures/content';

const FILES = [
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions'),
];
const content: Content = loadOrThrow(FILES);

/** A game with three people in the circle: poor, rich and richer, in that order. */
function withCircle(): { ctx: Ctx; hero: Character; people: Character[] } {
  const state = newGame(1, content);
  state.circle = []; // the circle of the new game (D-167) is not the one under test
  const ctx = { state, content };
  const people = [5, 100, 200].map((money) => {
    const c = createCharacter(ctx, { surname: 'Circle', age: { min: 30, max: 30 } });
    c.money = money;
    c.occupation = 'porter';
    state.circle.push(c.id);
    return c;
  });
  return { ctx, hero: getPlayer(state), people };
}

const roles = (def: object) => RolesSchema.parse(def);

describe('filling roles', () => {
  it('takes a person of the circle that fits `where`, and spends no randomness to ask', () => {
    const { ctx, hero } = withCircle();
    const def = roles({ lender: { pick: 'circle', where: { money_min: 150 } } });
    const rng = [...ctx.state.rng];
    expect(canFillRoles(ctx, def, baseScope(hero, hero))).toBe(true);
    expect(ctx.state.rng).toEqual(rng);
    expect(fillRoles(ctx, def, baseScope(hero, hero))).toMatchObject({ lender: expect.any(String) });
  });

  it('refuses when a role that is not optional has nobody, and spends nothing', () => {
    const { ctx, hero } = withCircle();
    const rng = [...ctx.state.rng];
    const nobody = roles({ rich: { pick: 'circle', where: { money_min: 1000 } } });
    expect(canFillRoles(ctx, nobody, baseScope(hero, hero))).toBe(false);
    expect(fillRoles(ctx, nobody, baseScope(hero, hero))).toBeNull();
    expect(ctx.state.rng).toEqual(rng);
  });

  it('leaves an optional role empty', () => {
    const { ctx, hero } = withCircle();
    const optional = roles({ rich: { pick: 'circle', where: { money_min: 1000 }, optional: true } });
    expect(fillRoles(ctx, optional, baseScope(hero, hero))).toEqual({ hero: hero.id, protagonist: hero.id });
    expect(canFillRoles(ctx, optional, baseScope(hero, hero))).toBe(true);
  });

  it('gives one person at most one role', () => {
    const { ctx, hero, people } = withCircle();
    const one = roles({ a: { pick: 'circle', where: { money_min: 150 } }, b: { pick: 'circle', where: { money_min: 150 } } });
    expect(canFillRoles(ctx, one, baseScope(hero, hero))).toBe(false);
    const two = roles({ a: { pick: 'circle', where: { money_min: 50 } }, b: { pick: 'circle', where: { money_min: 50 } } });
    for (let i = 0; i < 20; i++) {
      const scope = fillRoles(ctx, two, baseScope(hero, hero))!;
      expect(new Set([scope.a, scope.b])).toEqual(new Set([people[1]!.id, people[2]!.id]));
    }
  });

  it('never lets an early role take the only person a later one needs', () => {
    const { ctx, hero, people } = withCircle();
    const def = roles({ any: { pick: 'circle' }, rich: { pick: 'circle', where: { money_min: 150 } } });
    for (let i = 0; i < 100; i++) {
      const scope = fillRoles(ctx, def, baseScope(hero, hero))!;
      expect(scope.rich).toBe(people[2]!.id);
      expect(scope.any).not.toBe(people[2]!.id);
    }
  });

  it('gives neither the hero nor the main participant a role', () => {
    const { ctx, hero, people } = withCircle();
    const def = roles({ x: { pick: 'circle' }, y: { pick: 'circle' }, z: { pick: 'circle', optional: true } });
    for (let i = 0; i < 30; i++) {
      const scope = fillRoles(ctx, def, baseScope(hero, people[0]!))!;
      const taken = [scope.x, scope.y, scope.z];
      expect(taken).not.toContain(hero.id);
      expect(taken).not.toContain(people[0]!.id);
    }
    expect(canFillRoles(ctx, roles({ x: { pick: 'circle' }, y: { pick: 'circle' }, z: { pick: 'circle' } }), baseScope(hero, people[0]!))).toBe(false);
  });

  it('weighs candidates by `prefer`: ×5 gives its share over 1000 draws from the world stream', () => {
    const { ctx, hero, people } = withCircle();
    const def = roles({ x: { pick: 'circle', prefer: [{ when: { money_min: 100 }, factor: 5 }] } });
    let poor = 0;
    for (let i = 0; i < 1000; i++) if (fillRoles(ctx, def, baseScope(hero, hero))!.x === people[0]!.id) poor++;
    expect(poor).toBeGreaterThan(65); // expected 1/11 of 1000 ≈ 91
    expect(poor).toBeLessThan(120);
    const half = roles({ x: { pick: 'circle', prefer: [{ when: { money_min: 100 }, factor: '1/2' }] } });
    let rich = 0;
    for (let i = 0; i < 1000; i++) if (fillRoles(ctx, half, baseScope(hero, hero))!.x !== people[0]!.id) rich++;
    expect(rich).toBeGreaterThan(420); // expected 1/2 of 1000 (two of weight 1/2 against one of 1)
    expect(rich).toBeLessThan(580);
  });

  it('refuses a hopeless event at once instead of trying every combination of the earlier roles', () => {
    const { ctx, hero } = withCircle();
    for (let i = 0; i < 42; i++) {
      const c = createCharacter(ctx, { surname: 'Crowd', age: { min: 30, max: 30 } });
      c.occupation = 'porter';
      ctx.state.circle.push(c.id);
    }
    const def = roles({ a: { pick: 'circle' }, b: { pick: 'circle' }, c: { pick: 'circle' }, z: { pick: 'relation', kind: 'rival' } });
    const t0 = Date.now();
    expect(canFillRoles(ctx, def, baseScope(hero, hero))).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000); // ~850 ms with 45 people before the quick refusal; now a fraction of a ms
  });

  it('refuses at once when two roles need the same only person', () => {
    const { ctx, hero } = withCircle();
    for (let i = 0; i < 42; i++) {
      const c = createCharacter(ctx, { surname: 'Crowd', age: { min: 30, max: 30 } });
      c.occupation = 'porter';
      ctx.state.circle.push(c.id);
    }
    const elder = createCharacter(ctx, { surname: 'Elder', age: { min: 60, max: 60 } });
    elder.occupation = 'elder';
    ctx.state.circle.push(elder.id);
    const where = { occupation: ['elder'] };
    const def = roles({ x: { pick: 'circle' }, y: { pick: 'circle' }, z: { pick: 'circle' }, d: { pick: 'circle', where }, e: { pick: 'circle', where } });
    const t0 = Date.now();
    expect(canFillRoles(ctx, def, baseScope(hero, hero))).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000); // tens of seconds with 45 people without the matching
  });

  it('lets a later role take a person whom an optional `given` role gave up', () => {
    const { ctx, hero, people } = withCircle();
    people[0]!.occupation = 'elder';
    const def = roles({ a: { pick: 'given', optional: true, where: { money_min: 1000 } }, b: { pick: 'circle', where: { occupation: ['elder'] } } });
    const given = { ...baseScope(hero, hero), a: people[0]!.id };
    expect(canFillRoles(ctx, def, given)).toBe(true);
    expect(fillRoles(ctx, def, given)).toEqual({ ...baseScope(hero, hero), b: people[0]!.id });
  });

  it('is deterministic for a seed', () => {
    const def = roles({ a: { pick: 'circle' }, b: { pick: 'circle' } });
    const run = () => {
      const { ctx, hero } = withCircle();
      return [0, 1, 2, 3, 4].map(() => fillRoles(ctx, def, baseScope(hero, hero)));
    };
    expect(run()).toEqual(run());
  });
});

describe('picks', () => {
  it('`known` and `close` need the hero to know the person that well', () => {
    const { ctx, hero, people } = withCircle();
    ctx.state.acquaintances.length = 0;
    const known = roles({ x: { pick: 'known' } });
    const close = roles({ x: { pick: 'close' } });
    expect(canFillRoles(ctx, known, baseScope(hero, hero))).toBe(false);
    introduce(ctx, people[1]!.id, 'known');
    expect(fillRoles(ctx, known, baseScope(hero, hero))!.x).toBe(people[1]!.id);
    expect(canFillRoles(ctx, close, baseScope(hero, hero))).toBe(false);
    introduce(ctx, people[2]!.id, 'close');
    expect(fillRoles(ctx, close, baseScope(hero, hero))!.x).toBe(people[2]!.id);
  });

  it('`relation` of a kind takes the rival of the main participant', () => {
    const { ctx, hero, people } = withCircle();
    startRelation(ctx, 'rival', hero.id, people[1]!.id);
    startRelation(ctx, 'friend', hero.id, people[2]!.id);
    const def = roles({ foe: { pick: 'relation', kind: 'rival' } });
    for (let i = 0; i < 10; i++) expect(fillRoles(ctx, def, baseScope(hero, hero))!.foe).toBe(people[1]!.id);
    expect(canFillRoles(ctx, roles({ x: { pick: 'relation', kind: 'patron' } }), baseScope(hero, hero))).toBe(false);
  });

  it('`given` stays while the person lives and is in the circle; otherwise the event is refused', () => {
    const { ctx, hero, people } = withCircle();
    const def = roles({ rival: { pick: 'given' } });
    const given = { ...baseScope(hero, hero), rival: people[0]!.id };
    expect(fillRoles(ctx, def, given)).toEqual(given);
    people[0]!.deathDay = ctx.state.day;
    expect(canFillRoles(ctx, def, given)).toBe(false);
    expect(fillRoles(ctx, def, given)).toBeNull();
    people[0]!.deathDay = null;
    ctx.state.circle = ctx.state.circle.filter((id) => id !== people[0]!.id);
    expect(fillRoles(ctx, def, given)).toBeNull();
  });

  it('a given person is not picked for another role, nor does a given role double up the main participant', () => {
    const { ctx, hero, people } = withCircle();
    const def = roles({ any: { pick: 'circle' }, rival: { pick: 'given' } });
    for (let i = 0; i < 30; i++) {
      const scope = fillRoles(ctx, def, { ...baseScope(hero, hero), rival: people[0]!.id })!;
      expect(scope.any).not.toBe(people[0]!.id);
    }
    expect(fillRoles(ctx, def, { ...baseScope(hero, people[0]!), rival: people[0]!.id })).toBeNull();
  });
});

describe('condition `occupation`', () => {
  it('is met by a listed occupation and otherwise explains itself from population', () => {
    const { ctx, hero, people } = withCircle();
    people[0]!.occupation = 'elder';
    const scope = baseScope(hero, hero);
    expect(conditionReport(ctx, people[1]!, { occupation: ['porter'] }, scope).met).toBe(true);
    const report = conditionReport(ctx, people[0]!, { occupation: ['porter', 'guard'] }, scope);
    expect(report.met).toBe(false);
    expect(report.reasons).toEqual(['Only for Porter or Guard']);
    expect(report.hidden).toBe(false);
    people[0]!.occupation = null;
    expect(conditionReport(ctx, people[0]!, { occupation: ['porter'] }, scope).met).toBe(false);
  });

  it('picks only people with the occupation, in `where` and in the weight', () => {
    const { ctx, hero, people } = withCircle();
    people[0]!.occupation = 'elder';
    people[2]!.occupation = 'guard';
    const def = roles({ x: { pick: 'circle', where: { occupation: ['guard', 'elder'] } } });
    const scope = baseScope(hero, hero);
    for (let i = 0; i < 20; i++) expect([people[0]!.id, people[2]!.id]).toContain(fillRoles(ctx, def, scope)!.x);
    const x = def.x!;
    expect(anyCandidate(ctx, 'x', x, { occupation: ['elder'] }, scope)).toBe(true);
    expect(anyCandidate(ctx, 'x', x, { occupation: ['porter'] }, scope)).toBe(false);
    expect(anyCandidate(ctx, 'x', x, { money_min: 150 }, scope)).toBe(true);
    expect(anyCandidate(ctx, 'x', x, { money_min: 1000 }, scope)).toBe(false);
  });

  it('for `given`, the candidate is the person handed over', () => {
    const { ctx, hero, people } = withCircle();
    const x = roles({ x: { pick: 'given' } }).x!;
    const scope = { ...baseScope(hero, hero), x: people[1]!.id };
    expect(anyCandidate(ctx, 'x', x, { money_min: 50 }, scope)).toBe(true);
    expect(anyCandidate(ctx, 'x', x, { money_min: 150 }, scope)).toBe(false);
  });
});

describe('cross-check of roles', () => {
  const env = { file: 'f', path: 'roles', sources: {} as never };

  it('refuses built-in and placeholder names of roles', () => {
    const errors = checkRoles(roles({ protagonist: { pick: 'circle' }, he: { pick: 'circle' } }), env);
    expect(errors.map((e) => e.path)).toEqual(['roles.protagonist', 'roles.he']);
  });

  it('accepts the fixture event with every kind of role', () => {
    const result = loadContent([...FILES, ...readContentFiles('tests/fixtures/roles')]);
    expect(result.ok, JSON.stringify(!result.ok && result.errors)).toBe(true);
  });

  it('refuses an unknown occupation and a kind of relation that does not exist', () => {
    const sources = { opinions: [{ item: content.opinions! }], population: [{ item: content.population! }] } as never;
    const errors = checkRoles(
      roles({ a: { pick: 'relation', kind: 'enemy' }, b: { pick: 'circle', where: { occupation: ['jester'] } } }),
      { ...env, sources },
    );
    expect(errors.map((e) => e.path)).toEqual(['roles.a.kind', 'roles.b.where.occupation']);
  });
});
