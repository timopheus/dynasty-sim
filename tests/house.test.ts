import { describe, expect, it } from 'vitest';
import { conditionReport, type When } from '../src/core/condition-keys';
import { entryText } from '../src/core/chronicle/log';
import { applyEffects, type Effects } from '../src/core/effects';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { afterMarriage } from '../src/core/hooks';
import { houseById, houseInvariants, makeHouse, nicknameOf, renownShift, renownWord } from '../src/core/house/house';
import { checkInvariants } from '../src/core/invariants';
import { createCharacter, kill } from '../src/core/lifecycle';
import { entityPage } from '../src/core/pages/entity';
import { personPage } from '../src/core/pages/person';
import { secretsAbout } from '../src/core/relations/secrets';
import { deserialize, serialize } from '../src/core/save/save';
import type { Character, Ctx, GameState } from '../src/core/state';
import { toYmd } from '../src/core/time/calendar';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, loadOrThrow, realContent } from './fixtures/content';

const content = loadOrThrow([...BASE_FILES, ...readContentFiles('tests/fixtures/population'), ...readContentFiles('tests/fixtures/house')]);

function setup(seed = 3): { state: GameState; ctx: Ctx; hero: Character } {
  const state = newGame(seed, content);
  return { state, ctx: { state, content }, hero: getPlayer(state) };
}

const effects = (e: object): Effects => e as Effects;
const when = (w: object): When => w as When;

describe('the house of the founder', () => {
  it('a new game makes the house of the hero: the surname, the lowest status, no renown, the hero as head', () => {
    const { state, hero } = setup();
    expect(state.houses).toHaveLength(1);
    const house = state.houses[0]!;
    expect(hero.house).toBe(house.id);
    expect(house).toMatchObject({ name: hero.surname, status: 'commoner', renown: 0, founded: 0 });
    expect(house.heads).toEqual([{ id: hero.id, name: `${hero.givenName} ${hero.surname}`, from: 0, to: null, nickname: null }]);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('the people of the circle belong to no house until they marry in', () => {
    const { state } = setup();
    expect(state.circle.length).toBeGreaterThan(0);
    for (const id of state.circle) expect(state.characters.find((c) => c.id === id)?.house).toBeNull();
  });
});

describe('children and spouses', () => {
  it('a child takes the house of the father', () => {
    const { ctx, hero } = setup();
    hero.sex = 'male';
    const mother = createCharacter(ctx, { surname: 'Other', age: { min: 25, max: 25 } });
    const child = createCharacter(ctx, { surname: hero.surname, age: { min: 1, max: 1 }, father: hero.id, mother: mother.id });
    expect(child.house).toBe(hero.house);
  });

  it('a child of a heroine-head takes her house, whatever the father has', () => {
    const { ctx, hero } = setup();
    hero.sex = 'female';
    const father = createCharacter(ctx, { surname: 'Other', age: { min: 25, max: 25 } });
    father.house = afterHouse(ctx, 'Other');
    const child = createCharacter(ctx, { surname: 'Other', age: { min: 1, max: 1 }, father: father.id, mother: hero.id });
    expect(child.house).toBe(hero.house);
  });

  it('a child of a woman who is not the hero takes the house of the father; with no father, hers', () => {
    const { ctx, hero } = setup();
    const mother = createCharacter(ctx, { surname: 'Other', age: { min: 25, max: 25 } });
    mother.house = afterHouse(ctx, 'Other');
    const child = createCharacter(ctx, { surname: 'Other', age: { min: 1, max: 1 }, father: hero.id, mother: mother.id });
    expect(child.house).toBe(hero.house);
    expect(createCharacter(ctx, { surname: 'Other', age: { min: 1, max: 1 }, mother: mother.id }).house).toBe(mother.house);
    expect(createCharacter(ctx, { surname: 'Other', age: { min: 1, max: 1 } }).house).toBeNull();
  });

  it('a marriage outside the house of the hero makes no house', () => {
    const { state, ctx } = setup();
    const a = createCharacter(ctx, { surname: 'A', age: { min: 20, max: 20 } });
    const b = createCharacter(ctx, { surname: 'B', age: { min: 20, max: 20 } });
    afterMarriage(ctx, { a: a.id, b: b.id, start: state.day, end: null, endReason: null });
    expect(state.houses).toHaveLength(1);
    expect([a.house, b.house]).toEqual([null, null]);
  });

  it('a marriage makes the house of a spouse who has none, from their surname', () => {
    const { state, ctx, hero } = setup();
    const bride = createCharacter(ctx, { surname: 'Bride', age: { min: 20, max: 20 } });
    afterMarriage(ctx, { a: hero.id, b: bride.id, start: state.day, end: null, endReason: null });
    expect(state.houses).toHaveLength(2);
    expect(bride.house).not.toBeNull();
    expect(houseById(state, bride.house)).toMatchObject({ name: 'Bride', status: 'commoner', renown: 0, heads: [] });
    expect(hero.house).toBe(state.houses[0]!.id);
    // a spouse who has a house keeps it
    const groom = createCharacter(ctx, { surname: 'Groom', age: { min: 20, max: 20 } });
    groom.house = bride.house;
    afterMarriage(ctx, { a: hero.id, b: groom.id, start: state.day, end: null, endReason: null });
    expect(state.houses).toHaveLength(2);
    expect(houseInvariants(ctx)).toEqual([]);
  });
});

/** A house made by hand for a person. */
function afterHouse(ctx: Ctx, name: string): string {
  const id = makeHouse(ctx, name).id;
  expect(id).toMatch(/^h\d+$/);
  return id;
}

describe('status and renown by effects', () => {
  it('house_status sets the status and writes a line with a link to the house', () => {
    const { state, ctx, hero } = setup();
    applyEffects(ctx, hero, effects({ house_status: { status: 'guild' } }), { hero: hero.id });
    const house = state.houses[0]!;
    expect(house.status).toBe('guild');
    const line = state.chronicle.at(-1)!;
    expect(line).toMatchObject({ subject: hero.id, kind: 'house_status', level: 'chronicle' });
    expect(entryText(line)).toBe(`${hero.givenName} ${hero.surname} led the ${hero.surname} house to Guild house.`);
    expect(line.parts).toContainEqual({ id: house.id, name: hero.surname });
    expect(secretsAbout(state, hero.id)).toEqual([]);
  });

  it('the same status again writes nothing; an unknown one changes nothing', () => {
    const { state, ctx, hero } = setup();
    applyEffects(ctx, hero, effects({ house_status: { status: 'guild' } }), { hero: hero.id });
    const before = serialize(state);
    applyEffects(ctx, hero, effects({ house_status: { status: 'guild' } }), { hero: hero.id });
    applyEffects(ctx, hero, effects({ house_status: { status: 'baron' } }), { hero: hero.id });
    expect(serialize(state)).toBe(before);
  });

  it('a status taken without the right is a secret of the head, made once', () => {
    const { state, ctx, hero } = setup();
    applyEffects(ctx, hero, effects({ house_status: { status: 'noble', usurped: true } }), { hero: hero.id });
    applyEffects(ctx, hero, effects({ house_status: { status: 'noble', usurped: true } }), { hero: hero.id });
    expect(state.houses[0]!.status).toBe('noble');
    const secrets = secretsAbout(state, hero.id);
    expect(secrets).toHaveLength(1);
    expect(secrets[0]).toMatchObject({ kind: 'usurped_status', knownBy: [hero.id] });
  });

  it('house_renown moves the renown up and down; a person with no house is skipped', () => {
    const { state, ctx, hero } = setup();
    applyEffects(ctx, hero, effects({ house_renown: 7 }), { hero: hero.id });
    applyEffects(ctx, hero, effects({ house_renown: -2 }), { hero: hero.id });
    expect(state.houses[0]!.renown).toBe(5);
    const stranger = createCharacter(ctx, { surname: 'Nobody', age: { min: 30, max: 30 } });
    const before = serialize(state);
    applyEffects(ctx, stranger, effects({ house_renown: 3, house_status: { status: 'noble', usurped: true } }), { hero: hero.id });
    expect(serialize(state)).toBe(before);
  });

  it('no secret when the status is not raised', () => {
    const { state, ctx, hero } = setup();
    applyEffects(ctx, hero, effects({ house_status: { status: 'guild' } }), { hero: hero.id });
    applyEffects(ctx, hero, effects({ house_status: { status: 'guild', usurped: true } }), { hero: hero.id });
    applyEffects(ctx, hero, effects({ house_status: { status: 'commoner', usurped: true } }), { hero: hero.id });
    expect(state.houses[0]!.status).toBe('commoner');
    expect(secretsAbout(state, hero.id)).toEqual([]);
  });

  it('the schema refuses a renown change of 0', () => {
    expect(() => loadOrThrow([...BASE_FILES, { path: 'x.yaml', text: 'events: [{id: e, weight: 1, text: t, options: [{text: o, effects: {house_renown: 0}, result: r}]}]' }])).toThrow(/nothing/);
  });
});

describe('conditions', () => {
  it('house_status_min compares the order of the statuses', () => {
    const { ctx, hero } = setup();
    expect(conditionReport(ctx, hero, when({ house_status_min: 'commoner' }), { hero: hero.id }).met).toBe(true);
    const report = conditionReport(ctx, hero, when({ house_status_min: 'guild' }), { hero: hero.id });
    expect(report).toEqual({ met: false, reasons: ['Needs Guild house.'], hidden: false });
    applyEffects(ctx, hero, effects({ house_status: { status: 'noble' } }), { hero: hero.id });
    expect(conditionReport(ctx, hero, when({ house_status_min: 'guild' }), { hero: hero.id }).met).toBe(true);
  });

  it('house_renown_min tells the renown in words', () => {
    const { ctx, hero } = setup();
    expect(conditionReport(ctx, hero, when({ house_renown_min: 5 }), { hero: hero.id })).toEqual({ met: false, reasons: ['Needs a house that is Respected.'], hidden: false });
    applyEffects(ctx, hero, effects({ house_renown: 5 }), { hero: hero.id });
    expect(conditionReport(ctx, hero, when({ house_renown_min: 5 }), { hero: hero.id }).met).toBe(true);
  });

  it('the reason names the step the house must reach, not the one it has', () => {
    const { ctx, hero } = setup();
    applyEffects(ctx, hero, effects({ house_renown: 5 }), { hero: hero.id });
    expect(conditionReport(ctx, hero, when({ house_renown_min: -1 }), { hero: hero.id }).met).toBe(true);
    applyEffects(ctx, hero, effects({ house_renown: -10 }), { hero: hero.id });
    expect(conditionReport(ctx, hero, when({ house_renown_min: -1 }), { hero: hero.id }).reasons).toEqual(['Needs a house that is Unremarked.']);
    expect(conditionReport(ctx, hero, when({ house_renown_min: 5 }), { hero: hero.id }).reasons).toEqual(['Needs a house that is Respected.']);
  });

  it('a person with no house meets neither', () => {
    const { ctx, hero } = setup();
    const stranger = createCharacter(ctx, { surname: 'Nobody', age: { min: 30, max: 30 } });
    const scope = { hero: hero.id };
    expect(conditionReport(ctx, stranger, when({ house_status_min: 'commoner' }), scope).met).toBe(false);
    expect(conditionReport(ctx, stranger, when({ house_renown_min: -50 }), scope).met).toBe(false);
  });

  it('renown words: the last whose limit is reached, the first below them all', () => {
    expect([-500, -1, 4, 5, 90].map((n) => renownWord(content, n))).toEqual(['Disgraced', 'Unremarked', 'Unremarked', 'Respected', 'Respected']);
  });
});

describe('nickname, memory of the house and succession', () => {
  it('the nickname comes from the first reputation trait held, in the order of the table', () => {
    const { hero } = setup();
    expect(nicknameOf(content, hero)).toBeNull();
    hero.traits.push('oath_keeper');
    expect(nicknameOf(content, hero)).toBe('the Faithful');
    hero.traits.push('coward');
    expect(nicknameOf(content, hero)).toBe('the Coward');
  });

  it('the death of a head records the nickname and moves the renown by fame and traits', () => {
    const { state, ctx, hero } = setup();
    hero.traits.push('coward', 'oath_keeper');
    hero.fame = 2;
    expect(renownShift(content, hero)).toBe(2 - 3 + 2);
    applyEffects(ctx, hero, effects({ house_renown: 4 }), { hero: hero.id });
    kill(ctx, hero, 'natural');
    const house = state.houses[0]!;
    expect(house.renown).toBe(4 + 1);
    expect(house.heads[0]).toMatchObject({ id: hero.id, from: 0, to: state.day, nickname: 'the Coward' });
  });

  it('the placeholder heir takes the house of the dead and leads it', () => {
    const { state, ctx, hero } = setup();
    state.day += 400;
    kill(ctx, hero, 'natural');
    const heir = getPlayer(state);
    expect(heir.id).not.toBe(hero.id);
    expect(heir.house).toBe(hero.house);
    const house = state.houses[0]!;
    expect(house.heads.map((h) => [h.id, h.to])).toEqual([[hero.id, state.day], [heir.id, null]]);
    expect(house.heads[0]!.nickname).toBeNull();
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('a house survives the save', () => {
    const { state, ctx, hero } = setup();
    applyEffects(ctx, hero, effects({ house_status: { status: 'guild' }, house_renown: 3 }), { hero: hero.id });
    kill(ctx, hero, 'natural');
    expect(serialize(deserialize(serialize(state), content))).toBe(serialize(state));
  });
});

describe('invariants', () => {
  it('catch an unknown status, a second head, a missing record and a bad term', () => {
    const { state, hero } = setup();
    const house = state.houses[0]!;
    house.status = 'baron';
    expect(checkInvariants(state, content).join()).toMatch(/unknown status baron/);
    house.status = 'commoner';
    house.heads.push({ id: 'c99', name: 'x', from: 0, to: null, nickname: null });
    expect(checkInvariants(state, content).join()).toMatch(/more than one head/);
    house.heads.pop();
    house.heads[0]!.from = state.day + 5;
    expect(checkInvariants(state, content).join()).toMatch(/invalid term/);
    house.heads.length = 0;
    expect(checkInvariants(state, content).join()).toMatch(new RegExp(`${hero.id} heads house`));
  });
});

describe('pages', () => {
  it('the page of a house shows the status, renown, heads with nicknames and the living; it is open from a link of the chronicle', () => {
    const { state, ctx, hero } = setup();
    state.day = 366 * 5;
    hero.traits.push('coward');
    applyEffects(ctx, hero, effects({ house_status: { status: 'guild' } }), { hero: hero.id });
    const id = hero.house as string;
    const link = state.chronicle.at(-1)!.parts.find((p) => typeof p !== 'string' && p.id === id);
    expect(link).toBeDefined();
    kill(ctx, hero, 'natural');
    const heir = getPlayer(state);
    const found = entityPage(ctx, id);
    expect(found?.type).toBe('entity');
    if (found?.type !== 'entity') return;
    const { page } = found;
    expect(page).toMatchObject({ id, kind: 'house', title: `House ${hero.surname}`, subtitle: 'Guild house' });
    const labels = page.facts.map((f) => f.label);
    expect(labels.slice(0, 3)).toEqual(['Status', 'Renown', 'Founded']);
    const year = (day: number) => toYmd(day).year;
    expect(page.facts.find((f) => f.label === `${year(0)}–${year(state.day)}`)?.parts).toEqual([{ id: hero.id, name: `${hero.givenName} ${hero.surname}` }, ', the Coward']);
    expect(page.facts.find((f) => f.label === `${year(state.day)}–`)?.parts).toEqual([{ id: heir.id, name: `${heir.givenName} ${heir.surname}` }]);
    expect(page.facts.find((f) => f.label === 'Living')?.parts).toContainEqual({ id: heir.id, name: `${heir.givenName} ${heir.surname}` });
    expect(page.chronicle.some((e) => e.kind === 'house_status')).toBe(true);
  });

  it('the page lists only living members near the hero', () => {
    const { ctx, hero } = setup();
    const far = createCharacter(ctx, { surname: 'Far', age: { min: 20, max: 20 }, father: hero.id });
    const near = createCharacter(ctx, { surname: 'Near', age: { min: 5, max: 5 }, father: hero.id });
    ctx.state.household.push(near.id);
    const found = entityPage(ctx, hero.house as string);
    if (found?.type !== 'entity') throw new Error('no page');
    const living = found.page.facts.find((f) => f.label === 'Living')!.parts.filter((p) => typeof p !== 'string').map((p) => (p as { id: string }).id);
    expect(living).toContain(near.id);
    expect(living).not.toContain(far.id);
  });

  it('an unknown house has no page', () => {
    const { ctx } = setup();
    expect(entityPage(ctx, 'h999')).toBeNull();
  });

  it('the page of a person has a section with the house and the nickname', () => {
    const { ctx, hero } = setup();
    const before = personPage(ctx, hero.id)!.sections.find((s) => s.id === 'house')!;
    expect(before.lines).toEqual([{ label: 'House', parts: [{ id: hero.house, name: hero.surname }] }]);
    hero.traits.push('oath_keeper');
    const after = personPage(ctx, hero.id)!.sections.find((s) => s.id === 'house')!;
    expect(after.lines.at(-1)).toEqual({ label: 'Nickname', parts: ['the Faithful'] });
    const stranger = createCharacter(ctx, { surname: 'Nobody', age: { min: 30, max: 30 } });
    expect(personPage(ctx, stranger.id)!.sections.find((s) => s.id === 'house')).toBeUndefined();
  });
});

describe('the real game', () => {
  it('the real content has the house key and its trait ids exist', () => {
    const real = realContent();
    expect(real.house?.statuses[0]?.id).toBe('commoner');
    expect(real.house?.nicknames.length).toBeGreaterThan(0);
  });

  it('forty heads in a row keep the house consistent', () => {
    const real = realContent();
    const state = newGame(1, real);
    for (let i = 0; i < 40 && state.status !== 'ended'; i++) {
      state.day += 365;
      // One death of the head a year: the heir may already be among the people (kin from the pedigree, 4.5).
      kill({ state, content: real }, getPlayer(state), 'natural');
      expect(houseInvariants({ state, content: real })).toEqual([]);
    }
    expect(state.houses).toHaveLength(1);
    expect(state.houses[0]!.heads).toHaveLength(41);
  });
});
