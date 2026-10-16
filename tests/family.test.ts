import { describe, expect, it } from 'vitest';
import { conditionReport } from '../src/core/condition-keys';
import { applyEffects } from '../src/core/effects';
import { familyInvariants } from '../src/core/family/family';
import { childrenOf, isCloseKin } from '../src/core/family/kin';
import { canMarry, marry } from '../src/core/family/marriage';
import { familyLines, familySection, proposalButton } from '../src/core/family/page';
import { makePedigree } from '../src/core/family/pedigree';
import { syncHousehold } from '../src/core/family/household';
import { familyPhase } from '../src/core/family/phases';
import { proposalOptions } from '../src/core/family/proposals';
import { apply, newGame } from '../src/core/game';
import { findCharacter, getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/hooks';
import { checkInvariants } from '../src/core/invariants';
import { kill } from '../src/core/lifecycle';
import { fillRoles } from '../src/core/roles/roles';
import { serialize } from '../src/core/save/save';
import type { Content } from '../src/core/content/schema';
import type { Character, Ctx, GameState } from '../src/core/state';
import { ageYears, fromYmd, toYmd } from '../src/core/time/calendar';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, loadOrThrow } from './fixtures/content';

const content = loadOrThrow([...BASE_FILES, ...readContentFiles('tests/fixtures/population'), ...readContentFiles('tests/fixtures/opinions'), ...readContentFiles('tests/fixtures/family')]);
const family = content.family ?? fail('fixture has no family');
function fail(message: string): never {
  throw new Error(message);
}

/** The fixture with some numbers of `family` changed. */
const withFamily = (more: Partial<typeof family>): Content => ({ ...content, family: { ...family, ...more } });

function game(seed = 3, c: Content = content): { state: GameState; ctx: Ctx; hero: Character } {
  const state = newGame(seed, c);
  const ctx: Ctx = { state, content: c };
  const hero = getPlayer(state);
  return { state, ctx, hero };
}

/** A person far from the hero, of a set sex and age, with an occupation so the world invariant holds. */
function person(ctx: Ctx, sex: 'male' | 'female', age: number, parents: { father?: Character; mother?: Character } = {}): Character {
  const c = createCharacter(ctx, {
    surname: sex === 'male' ? 'Smith' : 'Wells',
    age: { min: age, max: age },
    ...(parents.father ? { father: parents.father.id } : {}),
    ...(parents.mother ? { mother: parents.mother.id } : {}),
  });
  c.sex = sex;
  c.occupation = 'guard';
  return c;
}

/** Today is the person's birthday: born `age` years ago on this date. */
function birthdayToday(state: GameState, c: Character, age: number): void {
  const { year, month, day } = toYmd(state.day);
  c.birthDay = fromYmd(year - age, month, day);
}

describe('marriage and close kin (D-313)', () => {
  /** Two brothers-and-sisters lines from one couple: a and s are siblings, b their cousin. */
  function kin(ctx: Ctx) {
    const gf = person(ctx, 'male', 70);
    const gm = person(ctx, 'female', 68);
    const p1 = person(ctx, 'male', 45, { father: gf, mother: gm });
    const p2 = person(ctx, 'female', 43, { father: gf, mother: gm });
    const x = person(ctx, 'female', 44);
    const y = person(ctx, 'male', 46);
    const a = person(ctx, 'male', 20, { father: p1, mother: x });
    const s = person(ctx, 'female', 18, { father: p1, mother: x });
    const b = person(ctx, 'female', 19, { father: y, mother: p2 });
    const half = person(ctx, 'female', 17, { father: p1, mother: person(ctx, 'female', 40) });
    return { gf, p1, p2, a, s, b, half };
  }

  it('lets cousins marry', () => {
    const { state, ctx } = game();
    const f = kin(ctx);
    expect(isCloseKin(state, f.a.id, f.b.id)).toBe(false);
    const m = marry(ctx, f.a, f.b);
    expect(m).not.toBeNull();
    expect(f.a.spouse).toBe(f.b.id);
    expect(f.b.spouse).toBe(f.a.id);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('refuses brother and sister, half ones, an aunt and nephew: the effect changes nothing', () => {
    const { state, ctx, hero } = game();
    const f = kin(ctx);
    const before = serialize(state);
    for (const other of [f.s, f.half, f.p2]) {
      applyEffects(ctx, f.a, { marry: 'bride' }, { hero: hero.id, protagonist: hero.id, bride: other.id });
    }
    expect(serialize(state)).toBe(before);
    expect(canMarry(ctx, f.a, f.s)).toBe(false);
  });

  it('refuses the married, the young and the same sex', () => {
    const { ctx } = game();
    const man = person(ctx, 'male', 30);
    const wife = person(ctx, 'female', 28);
    expect(marry(ctx, man, wife)).not.toBeNull();
    expect(marry(ctx, man, person(ctx, 'female', 25))).toBeNull();
    expect(marry(ctx, person(ctx, 'male', 30), person(ctx, 'female', 15))).toBeNull();
    expect(marry(ctx, person(ctx, 'male', 30), person(ctx, 'male', 30))).toBeNull();
  });

  it('the invariant catches a marriage of brother and sister put in by hand', () => {
    const { state, ctx } = game();
    const f = kin(ctx);
    state.marriages.push({ a: f.a.id, b: f.s.id, start: state.day, end: null, endReason: null });
    f.a.spouse = f.s.id;
    f.s.spouse = f.a.id;
    expect(familyInvariants(ctx).join('\n')).toMatch(/close kin/);
  });

  it('a death ends the marriage; the widowed hero hears of it and may marry again', () => {
    const { state, ctx, hero } = game();
    hero.sex = 'male';
    const wife = person(ctx, 'female', 22);
    expect(marry(ctx, hero, wife)).not.toBeNull();
    expect(state.household).toEqual([wife.id]);
    expect(state.chronicle.at(-1)).toMatchObject({ subject: hero.id, kind: 'marriage' });
    kill(ctx, wife, 'illness');
    expect(state.marriages.find((m) => m.a === hero.id)).toMatchObject({ end: state.day, endReason: 'death' });
    expect(hero.spouse).toBeNull();
    expect(state.chronicle.some((e) => e.kind === 'family' && e.subject === hero.id)).toBe(true);
    expect(canMarry(ctx, hero, person(ctx, 'female', 24))).toBe(true);
    expect(checkInvariants(state, content)).toEqual([]);
  });
});

describe('births (4.5)', () => {
  /** The hero (of `sex`) married to a spouse of fertile age whose birthday — the wife's — is today. */
  function couple(c: Content, sex: 'male' | 'female' = 'male') {
    const { state, ctx, hero } = game(3, c);
    hero.sex = sex;
    const spouse = person(ctx, sex === 'male' ? 'female' : 'male', 25);
    marry(ctx, hero, spouse);
    const wife = sex === 'male' ? spouse : hero;
    birthdayToday(state, wife, 25);
    return { state, ctx, hero, spouse, wife };
  }

  it('a chance of 10000 gives a child with both parents, the surname and house of the father, in the household', () => {
    const { state, ctx, hero, spouse } = couple(content);
    familyPhase.run(ctx);
    expect(state.pregnancies).toEqual([{ mother: spouse.id, father: hero.id, due: state.day + 270 }]);
    state.day += 270;
    familyPhase.run(ctx);
    const child = childrenOf(state, hero.id)[0] ?? fail('no child');
    expect(child).toMatchObject({ father: hero.id, mother: spouse.id, surname: hero.surname, house: hero.house, birthDay: state.day, kinKnown: true });
    expect(state.household).toEqual([spouse.id, child.id]);
    expect(state.chronicle.at(-1)).toMatchObject({ subject: hero.id, kind: 'birth', level: 'chronicle' });
    expect(state.pregnancies).toEqual([]);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('a heroine-head gives her child her own surname (D-313)', () => {
    const { state, ctx, hero, spouse } = couple(content, 'female');
    familyPhase.run(ctx);
    state.day += 270;
    familyPhase.run(ctx);
    const child = childrenOf(state, hero.id)[0] ?? fail('no child');
    expect(child.surname).toBe(hero.surname);
    expect(child.surname).not.toBe(spouse.surname);
    expect(child.mother).toBe(hero.id);
  });

  it('death in childbirth is a death request (D-164)', () => {
    const c = withFamily({ childbirthDeathPer10k: 10000 });
    const { state, ctx, wife } = couple(c);
    familyPhase.run(ctx);
    state.day += 270;
    familyPhase.run(ctx);
    expect(state.deathRequests).toEqual([{ characterId: wife.id, cause: 'childbirth' }]);
    expect(wife.deathDay).toBeNull();
  });

  it('the ceiling of the living stops the couples of the circle, never the hero house', () => {
    const c = withFamily({ livingMax: 1 });
    const { state, ctx, wife } = couple(c);
    const husband = person(ctx, 'male', 30);
    const other = person(ctx, 'female', 25);
    marry(ctx, husband, other);
    state.circle.push(husband.id, other.id);
    birthdayToday(state, other, 25);
    familyPhase.run(ctx);
    expect(state.pregnancies.map((p) => p.mother)).toEqual([wife.id]);
  });

  it('without a ceiling the couples of the circle have children too', () => {
    const { state, ctx } = couple(content);
    const husband = person(ctx, 'male', 30);
    const other = person(ctx, 'female', 25);
    marry(ctx, husband, other);
    state.circle.push(husband.id, other.id);
    birthdayToday(state, other, 25);
    familyPhase.run(ctx);
    expect(state.pregnancies.map((p) => p.mother)).toContain(other.id);
  });

  it('a child of the hero comes of age and leaves the household for the circle, with an occupation', () => {
    const { state, ctx, hero, spouse } = couple(content);
    const child = person(ctx, 'male', 10, { father: hero, mother: spouse });
    child.occupation = null;
    syncHousehold(ctx);
    expect(state.household).toContain(child.id);
    child.birthDay = fromYmd(toYmd(state.day).year - 16, 1, 1);
    familyPhase.run(ctx);
    expect(state.household).not.toContain(child.id);
    expect(state.circle).toContain(child.id);
    expect(child.occupation).not.toBeNull();
    expect(checkInvariants(state, content)).toEqual([]);
  });
});

describe('pedigrees (D-313)', () => {
  const kinOf = (state: GameState, c: Character) =>
    state.characters
      .filter((x) => x.id !== c.id && (x.id === c.father || x.id === c.mother || x.id === c.spouse || x.father === c.id || x.mother === c.id || (c.father !== null && x.father === c.father)))
      .map((x) => ({ sex: x.sex, age: ageYears(x.birthDay, state.day), name: x.givenName, surname: x.surname, occupation: x.occupation }));

  it('the founder gets living kin: parents and brothers and sisters, the first line of succession', () => {
    const { state, hero } = game();
    const father = findCharacter(state, hero.father ?? '') ?? fail('no father');
    const mother = findCharacter(state, hero.mother ?? '') ?? fail('no mother');
    expect([father.sex, mother.sex]).toEqual(['male', 'female']);
    expect(father.spouse).toBe(mother.id);
    expect(childrenOf(state, father.id)).toHaveLength(3);
    expect(hero.kinKnown).toBe(true);
    expect(state.circle).not.toContain(father.id);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('is the same for the same seed and id, and spends nothing of the world stream', () => {
    const make = () => {
      const { state, ctx } = game(9);
      const newcomer = person(ctx, 'male', 35);
      const rng = [...state.rng];
      makePedigree(ctx, newcomer);
      expect(state.rng).toEqual(rng);
      expect(newcomer.spouse).not.toBeNull();
      return kinOf(state, newcomer);
    };
    const a = make();
    expect(a.length).toBeGreaterThan(3);
    expect(make()).toEqual(a);
  });

  it('is made once, when the person first joins the circle', () => {
    const { state, ctx } = game();
    const newcomer = person(ctx, 'female', 30);
    state.circle.push(newcomer.id);
    const count = state.characters.length;
    familyPhase.run(ctx);
    expect(newcomer.kinKnown).toBe(true);
    expect(state.characters.length).toBeGreaterThan(count);
    const after = state.characters.length;
    familyPhase.run(ctx);
    expect(state.characters.length).toBe(after);
    expect(checkInvariants(state, content)).toEqual([]);
  });
});

describe('conditions and the role `pick: kin` (4.5)', () => {
  it('married, kin, children_min, can_marry', () => {
    const { state, ctx, hero } = game();
    hero.sex = 'male';
    const wife = person(ctx, 'female', 22);
    const met = (c: Character, when: object, scope: Record<string, string> = {}) => conditionReport(ctx, c, when, { hero: hero.id, protagonist: c.id, ...scope }).met;
    expect(met(hero, { married: false })).toBe(true);
    expect(met(hero, { can_marry: 'w' }, { w: wife.id })).toBe(true);
    marry(ctx, hero, wife);
    expect(met(hero, { married: true })).toBe(true);
    expect(met(hero, { can_marry: 'w' }, { w: wife.id })).toBe(false);
    expect(met(wife, { kin: { kind: 'spouse', with: 'hero' } })).toBe(true);
    const son = person(ctx, 'male', 3, { father: hero, mother: wife });
    expect(met(son, { kin: { kind: 'child', with: 'hero' } })).toBe(true);
    expect(met(hero, { kin: { kind: 'parent', with: 's' } }, { s: son.id })).toBe(true);
    expect(met(hero, { children_min: 1 })).toBe(true);
    expect(met(hero, { children_min: 2 })).toBe(false);
    // A role that is not filled: not met, and hidden (D-221).
    const report = conditionReport(ctx, hero, { kin: { kind: 'child', with: 'nobody' } }, { hero: hero.id, protagonist: hero.id });
    expect(report.met).toBe(false);
    expect(report.reasons).toEqual([]);
    void state;
  });

  it('`pick: kin` takes kin of the main participant who are near the hero', () => {
    const { state, ctx, hero } = game();
    hero.sex = 'male';
    const wife = person(ctx, 'female', 22);
    marry(ctx, hero, wife);
    const roles = content.events.find((e) => e.id === 'kin_visit')?.roles;
    const base = { hero: hero.id, protagonist: hero.id };
    expect(fillRoles(ctx, roles, base)).toBeNull();
    const son = person(ctx, 'male', 2, { father: hero, mother: wife });
    syncHousehold(ctx);
    expect(state.household).toContain(son.id);
    expect(fillRoles(ctx, roles, base)).toEqual({ ...base, son: son.id });
  });
});

describe('proposals (D-313)', () => {
  function setup() {
    const { state, ctx, hero } = game();
    hero.sex = 'male';
    const bride = person(ctx, 'female', 21);
    state.circle.push(bride.id);
    bride.kinKnown = true;
    return { state, ctx, hero, bride };
  }

  it('the page of a person offers a match with the hero; the command fires the event and the answer marries them', () => {
    const { state, ctx, hero, bride } = setup();
    expect(proposalOptions(ctx, bride.id)).toEqual([{ suitor: hero.id, target: bride.id }]);
    const line = familySection(ctx, bride, 'stranger')?.lines[0] ?? fail('no line');
    expect(proposalButton(line)).toEqual({ text: `Propose marriage to Anne Wells`, order: { suitor: hero.id, target: bride.id } });
    apply(state, content, { type: 'propose', suitor: hero.id, target: bride.id });
    expect(state.status).toBe('awaiting_choice');
    expect(state.pendingEvent).toMatchObject({ eventId: 'proposal', scope: { suitor: hero.id, target: bride.id } });
    apply(state, content, { type: 'choose', option: 0 });
    expect(hero.spouse).toBe(bride.id);
    expect(state.status).toBe('awaiting_action');
    expect(state.household).toEqual([bride.id]);
    expect(state.circle).not.toContain(bride.id);
    expect(proposalOptions(ctx, bride.id)).toEqual([]);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('a match of a child of the hero with a child of the person', () => {
    const { state, ctx, hero, bride } = setup();
    const wife = person(ctx, 'female', 40);
    marry(ctx, hero, wife);
    const son = person(ctx, 'male', 20, { father: hero, mother: wife });
    state.circle.push(son.id);
    const elder = person(ctx, 'male', 45);
    state.circle.push(elder.id);
    bride.father = elder.id;
    const options = proposalOptions(ctx, elder.id);
    expect(options).toEqual([{ suitor: son.id, target: bride.id }]);
    const line = familySection(ctx, elder, 'known')?.lines.find((l) => proposalButton(l) !== null) ?? fail('no proposal');
    expect(proposalButton(line)?.text).toBe('Propose a match: Anne Smith and Anne Wells');
    apply(state, content, { type: 'propose', ...options[0] as { suitor: string; target: string } });
    apply(state, content, { type: 'choose', option: 0 });
    expect(son.spouse).toBe(bride.id);
    expect(hero.spouse).toBe(wife.id);
  });

  it('refuses a match it would not offer, and changes nothing', () => {
    const { state, ctx, hero, bride } = setup();
    const far = person(ctx, 'female', 21);
    const before = serialize(state);
    expect(() => apply(state, content, { type: 'propose', suitor: hero.id, target: far.id })).toThrow(/No match/);
    expect(() => apply(state, content, { type: 'propose', suitor: bride.id, target: hero.id })).toThrow(/No match/);
    expect(serialize(state)).toBe(before);
    void ctx;
  });

  it('the family section lists parents, spouses and children, the dead marked', () => {
    const { ctx, hero } = game();
    hero.sex = 'male';
    const wife = person(ctx, 'female', 22);
    marry(ctx, hero, wife);
    const son = person(ctx, 'male', 2, { father: hero, mother: wife });
    kill(ctx, son, 'illness');
    const lines = familyLines(ctx, hero);
    expect(lines.map((l) => l.label)).toEqual(['Father', 'Mother', 'Wife', 'Children']);
    expect(lines.at(-1)?.parts).toEqual([{ id: son.id, name: 'Anne Smith' }, ' (dead)']);
  });
});
