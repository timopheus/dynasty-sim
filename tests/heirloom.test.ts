import { describe, expect, it } from 'vitest';
import { conditionReport, type When } from '../src/core/condition-keys';
import { entryText } from '../src/core/chronicle/log';
import { applyEffects, type Effects } from '../src/core/effects';
import { play, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { heirloomById, heldBy, livingHeirlooms } from '../src/core/heirloom/heirloom';
import { checkInvariants } from '../src/core/invariants';
import { createCharacter, kill } from '../src/core/lifecycle';
import { entityPage } from '../src/core/pages/entity';
import { opinionValue } from '../src/core/relations/opinions';
import { archivePhase } from '../src/core/archive/phases';
import { archiveProblems } from '../src/core/archive/archive';
import { isNear } from '../src/core/world/world';
import { willCommandOf, willForm } from '../src/ui/will';
import { botCommand } from '../src/core/bot';
import { seedRng } from '../src/core/rng';
import { deserialize, serialize } from '../src/core/save/save';
import type { Content } from '../src/core/content/schema';
import type { Character, Ctx, GameState } from '../src/core/state';
import { narratorContent } from '../src/core/narrator/content';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, loadOrThrow, realContent } from './fixtures/content';

const loaded = loadOrThrow([
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions').filter((f) => f.path.endsWith('traits.yaml')),
  ...readContentFiles('tests/fixtures/succession'),
  ...readContentFiles('tests/fixtures/heirloom'),
]);
const content: Content = { ...loaded, narrator: { ...narratorContent(loaded), eventChancePer10k: 0, longActionChancePer10k: 0, npcChancePer10k: 0 } };

function setup(seed = 3): { state: GameState; ctx: Ctx; hero: Character } {
  const state = newGame(seed, content);
  return { state, ctx: { state, content }, hero: getPlayer(state) };
}

const effects = (e: object): Effects => e as Effects;
const when = (w: object): When => w as When;

function person(ctx: Ctx, sex: 'male' | 'female', age: number, parents: { father?: string; mother?: string } = {}): Character {
  const c = createCharacter(ctx, { surname: 'Kin', age: { min: age, max: age }, ...parents });
  c.sex = sex;
  if (age >= ctx.content.settings.adultAge) c.occupation = ctx.content.population!.occupations[0]!.id;
  return c;
}

function make(ctx: Ctx, hero: Character, kind = 'sword', name = 'Dawn'): string {
  applyEffects(ctx, hero, effects({ heirloom_create: { kind, name } }), { hero: hero.id, protagonist: hero.id });
  return ctx.state.heirlooms.at(-1)!.id;
}

describe('a thing from an event', () => {
  it('heirloom_create makes a held thing, a term of the owner and a line linking to it', () => {
    const { state, ctx, hero } = setup();
    const id = make(ctx, hero);
    expect(id).toMatch(/^i\d+$/);
    expect(state.heirlooms[0]).toMatchObject({ name: 'Dawn', kind: 'sword', status: 'held', owner: hero.id, made: 0, ended: null });
    expect(state.heirlooms[0]!.owners).toEqual([{ id: hero.id, name: `${hero.givenName} ${hero.surname}`, from: 0, to: null }]);
    const line = state.chronicle.at(-1)!;
    expect(entryText(line)).toContain('came into Dawn, a Sword');
    expect(line.parts.some((p) => typeof p !== 'string' && p.id === id)).toBe(true);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('the name is a template: the grammar and the roles', () => {
    const { state, ctx, hero } = setup();
    make(ctx, hero, 'ring', '<metal> ring of {name}');
    expect(state.heirlooms[0]!.name).toMatch(/^(iron|silver) ring of /);
  });

  it('is not made over the limit', () => {
    const { state, ctx, hero } = setup();
    make(ctx, hero, 'sword', 'A');
    make(ctx, hero, 'sword', 'B');
    make(ctx, hero, 'ring', 'C');
    expect(state.heirlooms.map((h) => h.name)).toEqual(['A', 'B']);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('a lost thing frees a place', () => {
    const { state, ctx, hero } = setup();
    make(ctx, hero, 'sword', 'A');
    make(ctx, hero, 'sword', 'B');
    applyEffects(ctx, hero, effects({ heirloom_lose: {} }), { hero: hero.id, protagonist: hero.id });
    make(ctx, hero, 'ring', 'C');
    expect(livingHeirlooms(state).map((h) => h.name)).toEqual(['B', 'C']);
  });
});

describe('conditions', () => {
  it('has_heirloom and heirloom_count_min, with their reasons', () => {
    const { ctx, hero } = setup();
    const scope = { hero: hero.id, protagonist: hero.id };
    expect(conditionReport(ctx, hero, when({ has_heirloom: 'sword' }), scope).met).toBe(false);
    expect(conditionReport(ctx, hero, when({ has_heirloom: 'sword' }), scope).reasons).toEqual(['Needs a Sword.']);
    make(ctx, hero, 'sword');
    expect(conditionReport(ctx, hero, when({ has_heirloom: 'sword' }), scope).met).toBe(true);
    expect(conditionReport(ctx, hero, when({ has_heirloom: 'ring' }), scope).met).toBe(false);
    expect(conditionReport(ctx, hero, when({ heirloom_count_min: 2 }), scope).reasons).toEqual(['Needs 2 heirlooms.']);
    make(ctx, hero, 'ring');
    expect(conditionReport(ctx, hero, when({ heirloom_count_min: 2 }), scope).met).toBe(true);
  });
});

describe('give, sell, lose', () => {
  it('heirloom_give passes the thing to the person of the role', () => {
    const { state, ctx, hero } = setup();
    const kin = person(ctx, 'female', 30);
    const id = make(ctx, hero);
    state.day += 400;
    applyEffects(ctx, hero, effects({ heirloom_give: { to: 'friend' } }), { hero: hero.id, protagonist: hero.id, friend: kin.id });
    const h = heirloomById(state, id)!;
    expect(h.owner).toBe(kin.id);
    expect(h.owners.map((o) => [o.id, o.from, o.to])).toEqual([[hero.id, 0, 400], [kin.id, 400, null]]);
    expect(heldBy(state, hero)).toEqual([]);
    expect(entryText(state.chronicle.at(-1)!)).toContain('gave Dawn to');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('a gift to nobody, to a dead person or to oneself changes nothing', () => {
    const { state, ctx, hero } = setup();
    const dead = person(ctx, 'male', 30);
    const id = make(ctx, hero);
    kill(ctx, dead, 'test');
    applyEffects(ctx, hero, effects({ heirloom_give: { to: 'friend' } }), { hero: hero.id, protagonist: hero.id });
    applyEffects(ctx, hero, effects({ heirloom_give: { to: 'friend' } }), { hero: hero.id, protagonist: hero.id, friend: dead.id });
    applyEffects(ctx, hero, effects({ heirloom_give: { to: 'friend' } }), { hero: hero.id, protagonist: hero.id, friend: hero.id });
    expect(heirloomById(state, id)!.owner).toBe(hero.id);
  });

  it('heirloom_sell pays, writes a line, the house holds a grudge and the seller takes the trait', () => {
    const { state, ctx, hero } = setup();
    const wife = person(ctx, 'female', 30);
    wife.house = hero.house;
    state.household.push(wife.id);
    const id = make(ctx, hero);
    const before = hero.money;
    applyEffects(ctx, hero, effects({ heirloom_sell: { money: 120, reason: 'insult', trait: 'sellsword' } }), { hero: hero.id, protagonist: hero.id });
    const h = heirloomById(state, id)!;
    expect(h).toMatchObject({ status: 'sold', owner: null, ended: 0 });
    expect(hero.money).toBe(before + 120);
    expect(hero.traits).toContain('sellsword');
    expect(entryText(state.chronicle.at(-1)!)).toContain('sold Dawn');
    expect(opinionValue(ctx, wife.id, hero.id)).toBeLessThan(0);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('only the people of the house who are near hold the grudge of a sale', () => {
    const { state, ctx, hero } = setup();
    const far = person(ctx, 'male', 40);
    far.house = hero.house;
    expect(isNear(state, far.id)).toBe(false);
    make(ctx, hero);
    applyEffects(ctx, hero, effects({ heirloom_sell: { money: 10, reason: 'insult' } }), { hero: hero.id, protagonist: hero.id });
    expect(state.opinionReasons.filter((r) => r.holder === far.id)).toEqual([]);
  });

  it('selling or losing with nothing held does nothing', () => {
    const { state, ctx, hero } = setup();
    const before = hero.money;
    applyEffects(ctx, hero, effects({ heirloom_sell: { money: 50 }, heirloom_lose: {} }), { hero: hero.id, protagonist: hero.id });
    expect(hero.money).toBe(before);
    expect(state.heirlooms).toEqual([]);
  });

  it('the kind picks the thing', () => {
    const { state, ctx, hero } = setup();
    make(ctx, hero, 'sword', 'A');
    make(ctx, hero, 'ring', 'B');
    applyEffects(ctx, hero, effects({ heirloom_lose: { kind: 'ring' } }), { hero: hero.id, protagonist: hero.id });
    expect(state.heirlooms.map((h) => h.status)).toEqual(['held', 'lost']);
  });

  it('a lost thing stays on its page with the way it came and the owners', () => {
    const { state, ctx, hero } = setup();
    const id = make(ctx, hero);
    state.day = 800;
    applyEffects(ctx, hero, effects({ heirloom_lose: {} }), { hero: hero.id, protagonist: hero.id });
    const page = entityPage(ctx, id);
    expect(page?.type).toBe('entity');
    if (page?.type !== 'entity') return;
    expect(page.page.title).toBe('Dawn');
    const facts = Object.fromEntries(page.page.facts.map((f) => [f.label, f.parts.map((p) => (typeof p === 'string' ? p : p.name)).join('')]));
    expect(facts.State).toMatch(/^Lost in /);
    expect(facts.Came).toContain('came into Dawn');
    expect(page.page.chronicle.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the change of head', () => {
  it('without a will the main heir by law takes the thing', () => {
    const { state, ctx, hero } = setup();
    hero.sex = 'male';
    const son = person(ctx, 'male', 25, { father: hero.id });
    const id = make(ctx, hero);
    kill(ctx, hero, 'test');
    expect(state.playerId).toBe(son.id);
    const h = heirloomById(state, id)!;
    expect(h.owner).toBe(son.id);
    expect(h.owners.map((o) => o.id)).toEqual([hero.id, son.id]);
    expect(entryText(state.chronicle.at(-1)!)).toContain('inherited Dawn');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('a will names the receiver of the thing; the heir by law holds it against them', () => {
    const { state, ctx, hero } = setup();
    hero.sex = 'male';
    const son = person(ctx, 'male', 25, { father: hero.id });
    const daughter = person(ctx, 'female', 22, { father: hero.id });
    const id = make(ctx, hero);
    const other = make(ctx, hero, 'ring', 'Knot');
    state.will = { day: 0, heir: son.id, guardian: null, items: [{ item: id, to: daughter.id }], stale: false };
    kill(ctx, hero, 'test');
    expect(heirloomById(state, id)!.owner).toBe(daughter.id);
    expect(heirloomById(state, other)!.owner).toBe(son.id);
    expect(opinionValue(ctx, son.id, daughter.id)).toBeLessThan(0);
    expect(state.chronicle.map(entryText).some((t) => t.includes('was left Dawn'))).toBe(true);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('a receiver who died before the change leaves the thing to the heir', () => {
    const { state, ctx, hero } = setup();
    hero.sex = 'male';
    const son = person(ctx, 'male', 25, { father: hero.id });
    const daughter = person(ctx, 'female', 22, { father: hero.id });
    const id = make(ctx, hero);
    state.will = { day: 0, heir: son.id, guardian: null, items: [{ item: id, to: daughter.id }], stale: false };
    kill(ctx, daughter, 'test');
    kill(ctx, hero, 'test');
    expect(heirloomById(state, id)!.owner).toBe(son.id);
  });

  it('a thing given to a kinsman stays with them at the change of head; when they die it goes back to the head at once (D-426)', () => {
    const { state, ctx, hero } = setup();
    hero.sex = 'male';
    const son = person(ctx, 'male', 25, { father: hero.id });
    const uncle = person(ctx, 'male', 50);
    const id = make(ctx, hero);
    applyEffects(ctx, hero, effects({ heirloom_give: { to: 'friend' } }), { hero: hero.id, protagonist: hero.id, friend: uncle.id });
    kill(ctx, hero, 'test');
    expect(heirloomById(state, id)!.owner).toBe(uncle.id);
    kill(ctx, uncle, 'test');
    expect(heirloomById(state, id)!.owner).toBe(son.id);
    expect(heldBy(state, getPlayer(state)).map((h) => h.id)).toEqual([id]);
    expect(state.chronicle.at(-1)?.subject).toBe(son.id);
    kill(ctx, son, 'test');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('the will screen lists the things and the receivers; the command checks both (D-427)', () => {
    const { state, ctx, hero } = setup();
    hero.money = 10_000;
    const son = person(ctx, 'male', 25, { father: hero.id });
    const stranger = person(ctx, 'male', 40);
    if (!state.household.includes(son.id)) state.household.push(son.id);
    state.circle = state.circle.filter((id) => id !== stranger.id);
    state.household = state.household.filter((id) => id !== stranger.id);
    const id = make(ctx, hero);
    const form = willForm(state, content)!;
    expect(form.items).toEqual([{ id, label: 'Dawn', to: null }]);
    expect(form.receivers.map((c) => c.id)).toContain(son.id);
    expect(form.receivers.map((c) => c.id)).not.toContain(stranger.id);
    expect(() => play(state, content, { type: 'will', heir: null, guardian: null, items: [{ item: 'i999', to: son.id }] })).toThrow(/not a thing/);
    expect(() => play(state, content, { type: 'will', heir: null, guardian: null, items: [{ item: id, to: stranger.id }] })).toThrow(/cannot receive/);
    play(state, content, { type: 'will', heir: null, guardian: null, items: [{ item: id, to: son.id }] });
    expect((state.willDraft ?? state.will)?.items).toEqual([{ item: id, to: son.id }]);
  });

  it('the bot leaves things by will with commands the game takes; an empty receiver leaves the thing to the heir', () => {
    const { state, ctx, hero } = setup();
    hero.money = 10_000;
    const son = person(ctx, 'male', 25, { father: hero.id });
    if (!state.household.includes(son.id)) state.household.push(son.id);
    const id = make(ctx, hero);
    let found = null;
    for (let seed = 1; seed <= 500 && !found; seed++) {
      const command = botCommand(state, content, seedRng(seed, 11));
      if (command.type === 'will' && command.items.length > 0) found = command;
    }
    expect(found).not.toBeNull();
    expect(found).toMatchObject({ items: [{ item: id }] });
    expect(() => play(state, content, found!)).not.toThrow();
    expect(willCommandOf('', '', [{ item: id, to: '' }])).toEqual({ type: 'will', heir: null, guardian: null, items: [] });
    expect(willCommandOf('', '', [{ item: id, to: son.id }])).toMatchObject({ items: [{ item: id, to: son.id }] });
  });

  it('the owners are kept hot while the thing is held, and the state saves and loads', () => {
    const { state, ctx, hero } = setup();
    make(ctx, hero);
    const copy = deserialize(serialize(state), content);
    expect(copy.heirlooms).toEqual(state.heirlooms);
  });
});

describe('the archive', () => {
  it('a dead owner leaves for the archive: the thing went back to the head; links to things in old lines check (D-425)', () => {
    const { state, ctx, hero } = setup();
    const uncle = person(ctx, 'male', 50);
    const old = person(ctx, 'male', 60);
    const kept = make(ctx, hero, 'sword', 'Kept');
    const sold = make(ctx, hero, 'ring', 'Sold');
    applyEffects(ctx, hero, effects({ heirloom_give: { to: 'friend', kind: 'sword' } }), { hero: hero.id, protagonist: hero.id, friend: uncle.id });
    applyEffects(ctx, hero, effects({ heirloom_give: { to: 'friend', kind: 'ring' } }), { hero: hero.id, protagonist: hero.id, friend: old.id });
    applyEffects(ctx, old, effects({ heirloom_sell: { money: 1 } }), { hero: old.id, protagonist: old.id });
    kill(ctx, uncle, 'test');
    kill(ctx, old, 'test');
    expect(heirloomById(state, kept)!.owner).toBe(hero.id);
    expect(state.chronicle.some((e) => e.parts.some((p) => typeof p !== 'string' && p.id === kept))).toBe(true);
    state.day += 365 * 20;
    state.archiveYear = null;
    archivePhase.run(ctx);
    expect(state.archive.length).toBe(1);
    expect(state.characters.some((c) => c.id === uncle.id)).toBe(false);
    expect(state.characters.some((c) => c.id === old.id)).toBe(false);
    expect(heirloomById(state, sold)!.owners.map((o) => o.id)).toContain(old.id);
    expect(heirloomById(state, kept)!.owners.map((o) => o.id)).toEqual([hero.id, uncle.id, hero.id]);
    expect(entityPage(ctx, sold)?.type).toBe('entity');
    expect(entityPage(ctx, kept)?.type).toBe('entity');
    expect(archiveProblems(state, content)).toEqual([]);
    expect(checkInvariants(state, content)).toEqual([]);
  });
});

describe('the real content', () => {
  it('has heirlooms that load and run', () => {
    const real = realContent();
    expect(real.heirlooms?.max).toBeGreaterThan(0);
    const state = newGame(1, real);
    expect(checkInvariants(state, real)).toEqual([]);
  });
});
