import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/hooks';
import { kill } from '../src/core/lifecycle';
import { deserialize, serialize } from '../src/core/save/save';
import { faceSpec, geneDistance, genesOf, VARIANTS } from '../src/core/looks';
import { looksStream } from '../src/core/looks/genes';
import type { Character, Ctx, GameState } from '../src/core/state';
import { BASE_FILES, loadOrThrow, realContent } from './fixtures/content';

const content = loadOrThrow(BASE_FILES);

function setup(seed = 5, c = content): { state: GameState; ctx: Ctx; hero: Character } {
  const state = newGame(seed, c);
  return { state, ctx: { state, content: c }, hero: getPlayer(state) };
}

function person(ctx: Ctx, age: number, parents: { father?: Character; mother?: Character } = {}): Character {
  const c = createCharacter(ctx, {
    surname: 'Test',
    age: { min: age, max: age },
    ...(parents.father ? { father: parents.father.id } : {}),
    ...(parents.mother ? { mother: parents.mother.id } : {}),
  });
  c.occupation = 'guard';
  return c;
}

describe('genes (D-300, D-301)', () => {
  it('are the same for the same seed and id, and differ between people and seeds', () => {
    const a = setup(5);
    const b = setup(5);
    const other = setup(6);
    const id = a.hero.id;
    expect(genesOf(a.state, id)).toEqual(genesOf(b.state, id));
    expect(genesOf(a.state, id)).not.toEqual(genesOf(other.state, id));
    const p = person(a.ctx, 30);
    expect(genesOf(a.state, p.id)).not.toEqual(genesOf(a.state, id));
    expect(looksStream('c1')).not.toBe(looksStream('c2'));
  });

  it('children are closer to their parents than to strangers (sum of differences)', () => {
    const { ctx, state } = setup();
    let toParents = 0;
    let toStrangers = 0;
    const families: Character[][] = [];
    for (let i = 0; i < 40; i++) {
      const f = person(ctx, 40);
      const m = person(ctx, 38);
      families.push([f, m, person(ctx, 10, { father: f, mother: m })]);
    }
    families.forEach(([f, m, kid], i) => {
      const stranger = families[(i + 1) % families.length]![0]!;
      const g = genesOf(state, kid!.id);
      toParents += (geneDistance(g, genesOf(state, f!.id)) + geneDistance(g, genesOf(state, m!.id))) / 2;
      toStrangers += geneDistance(g, genesOf(state, stranger.id));
    });
    expect(toParents).toBeLessThan(toStrangers * 0.9);
  });

  it('one known parent is mixed with an unknown one, and both lines are stable', () => {
    const { ctx, state } = setup();
    const f = person(ctx, 40);
    const kid = person(ctx, 8, { father: f });
    const g = genesOf(state, kid.id);
    expect(genesOf(state, kid.id)).toEqual(g);
    expect(g).not.toEqual(genesOf(state, f.id));
  });

  it('a parent in the archive still passes genes on', () => {
    const { ctx, state } = setup();
    const f = person(ctx, 40);
    const m = person(ctx, 38);
    const kid = person(ctx, 8, { father: f, mother: m });
    const hot = genesOf(state, kid.id);
    const fresh = setup();
    const f2 = person(fresh.ctx, 40);
    const m2 = person(fresh.ctx, 38);
    const kid2 = person(fresh.ctx, 8, { father: f2, mother: m2 });
    fresh.state.characters = fresh.state.characters.filter((c) => c.id !== f2.id && c.id !== m2.id);
    fresh.state.archive.push({ characters: [f2, m2] } as unknown as GameState['archive'][number]);
    expect(genesOf(fresh.state, kid2.id)).toEqual(hot);
  });

  it('parents given later change the genes once, and a saved game shows the same face', () => {
    const { ctx, state } = setup();
    const f = person(ctx, 40);
    const m = person(ctx, 38);
    const far = person(ctx, 20);
    const alone = genesOf(state, far.id);
    far.father = f.id;
    far.mother = m.id;
    const withKin = genesOf(state, far.id);
    expect(withKin).not.toEqual(alone);
    const loaded = deserialize(serialize(state), content);
    expect(faceSpec({ state: loaded, content }, loaded.characters.find((c) => c.id === far.id)!, 'neutral')).toEqual(faceSpec(ctx, far, 'neutral'));
  });
});

describe('faceSpec', () => {
  it('has at least three variants for every detail', () => {
    for (const [name, n] of Object.entries(VARIANTS)) expect(n, name).toBeGreaterThanOrEqual(3);
  });

  it('100 scarred people do not all have the same scar', () => {
    const { ctx } = setup();
    const scars = new Set<string>();
    const variants = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const c = person(ctx, 30);
      c.traits.push('scarred');
      const s = faceSpec(ctx, c, 'neutral').scars;
      expect(s).toHaveLength(1);
      scars.add(JSON.stringify(s[0]));
      variants.add(s[0]!.variant);
    }
    expect(variants.size).toBeGreaterThanOrEqual(3);
    expect(scars.size).toBeGreaterThan(VARIANTS.scars);
  });

  it('a face is stable in time except for age and new conditions', () => {
    const { ctx, state } = setup();
    const c = person(ctx, 20);
    const before = faceSpec(ctx, c, 'neutral');
    state.day += 365;
    const later = faceSpec(ctx, c, 'neutral');
    for (const k of ['head', 'eyes', 'brows', 'nose', 'mouth', 'ears', 'headWidth', 'headHeight'] as const) expect(later[k], k).toEqual(before[k]);
    expect(later.age).toBe(before.age + 1);
    c.traits.push('scarred');
    const scarred = faceSpec(ctx, c, 'neutral');
    expect(scarred.scars).toHaveLength(1);
    expect({ ...scarred, scars: [] }).toEqual(later);
  });

  it('ages: grey and wrinkles come with years, a child has neither beard nor wrinkles', () => {
    const { ctx } = setup();
    const kid = person(ctx, 8);
    const elder = person(ctx, 70);
    kid.sex = 'male';
    elder.sex = 'male';
    expect(faceSpec(ctx, kid, 'neutral')).toMatchObject({ stage: 'child', grey: 0, beard: null, wrinkles: null });
    const old = faceSpec(ctx, elder, 'neutral');
    expect(old.stage).toBe('old');
    expect(old.grey).toBeGreaterThanOrEqual(2);
    expect(old.wrinkles?.level).toBe(3);
  });

  it('traits, wealth and mood show on top of the base face', () => {
    const { ctx } = setup();
    const c = person(ctx, 30);
    const base = faceSpec(ctx, c, 'neutral');
    c.traits.push('one_eyed', 'handsome');
    c.money = 5000;
    const marked = faceSpec(ctx, c, 'joy');
    expect(marked.eyepatch).not.toBeNull();
    expect(marked.beauty).toBe(1);
    expect(marked.attire).toBe(3);
    expect(marked.accessories.length).toBeGreaterThan(base.accessories.length);
    expect(marked.expression).toBe('joy');
    expect(marked.eyes).toEqual(base.eyes);
  });

  it('wounds leave scars and bandages, illness shows', () => {
    const { ctx, state } = setup(5, realContent());
    const c = person(ctx, 30);
    const plain = faceSpec(ctx, c, 'neutral');
    expect(plain.scars).toHaveLength(0);
    expect(plain.bandages).toHaveLength(0);
    c.conditions.push({ id: 'light_wound', stage: 'fresh', start: state.day, since: state.day });
    expect(faceSpec(ctx, c, 'neutral').bandages).toHaveLength(1);
    c.conditions = [{ id: 'old_wound', stage: 'closed', start: state.day, since: state.day }];
    expect(faceSpec(ctx, c, 'neutral').scars).toHaveLength(1);
    c.traits.push('scarred');
    expect(faceSpec(ctx, c, 'neutral').scars).toHaveLength(2);
    c.conditions = [{ id: 'fever', stage: 'crisis', start: state.day, since: state.day }];
    expect(faceSpec(ctx, c, 'neutral').illness).toBe(2);
  });

  it('a sick child has no wrinkles', () => {
    const { ctx, state } = setup(5, realContent());
    const kid = person(ctx, 8);
    kid.conditions.push({ id: 'fever', stage: 'feverish', start: state.day, since: state.day });
    expect(faceSpec(ctx, kid, 'neutral')).toMatchObject({ illness: 1, wrinkles: null });
  });

  it('does not spend the world stream and does not change the state', () => {
    const { ctx, state, hero } = setup();
    const kid = person(ctx, 5, { father: hero });
    const rng = [...state.rng];
    const json = JSON.stringify(state);
    for (const c of state.characters) faceSpec(ctx, c, 'pain');
    genesOf(state, kid.id);
    expect(state.rng).toEqual(rng);
    expect(JSON.stringify(state)).toBe(json);
  });

  it('the dead keep their face as on the day of death (D-303)', () => {
    const { ctx, state } = setup();
    const c = person(ctx, 50);
    c.traits.push('scarred');
    state.day += 100;
    const alive = faceSpec(ctx, c, 'neutral');
    kill(ctx, c, 'natural');
    const dead = faceSpec(ctx, c, 'joy');
    expect(dead).toMatchObject({ dead: true, expression: 'dead', age: alive.age, scars: alive.scars, head: alive.head });
    state.day += 3000;
    expect(faceSpec(ctx, c, 'neutral')).toEqual(dead);
  });
});
