import { describe, expect, it } from 'vitest';
import { botCommand } from '../src/core/bot';
import type { Content } from '../src/core/content/schema';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { createCharacter, kill } from '../src/core/lifecycle';
import { narratorContent } from '../src/core/narrator/content';
import { narratorPhase } from '../src/core/narrator/phases';
import { activeRelationBetween, endRelation } from '../src/core/relations/links';
import { opinionCauses } from '../src/core/relations/opinions';
import { seedRng } from '../src/core/rng';
import { deserialize, serialize } from '../src/core/save/save';
import { runSim } from '../src/core/sim';
import type { Character, Ctx, GameState } from '../src/core/state';
import { heirOf, lawGuardian, lawOrder } from '../src/core/succession/law';
import { successionPhase, willCommand } from '../src/core/succession/phases';
import { DAY_PHASES } from '../src/core/game';
import { ageYears } from '../src/core/time/calendar';
import { readContentFiles } from '../tools/content-files';
import { heirLine, willCommandOf, willForm } from '../src/ui/will';
import { BASE_FILES, loadOrThrow } from './fixtures/content';

/** Base, a small circle, the opinion traits and the succession fixture (law, notary, guardian, strict end). */
const loaded = loadOrThrow([
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions').filter((f) => f.path.endsWith('traits.yaml')),
  ...readContentFiles('tests/fixtures/succession'),
]);
/** No events of the narrator unless a test asks: the days at the notary run quietly. */
const quiet: Content = { ...loaded, narrator: { ...narratorContent(loaded), eventChancePer10k: 0, longActionChancePer10k: 0, npcChancePer10k: 0 } };
const withTemporary = (content: Content): Content => ({ ...content, succession: { ...content.succession!, temporaryHeir: true } });

function setup(content: Content = quiet, seed = 3): { state: GameState; ctx: Ctx; hero: Character } {
  const state = newGame(seed, content);
  return { state, ctx: { state, content }, hero: getPlayer(state) };
}

/** A person of a known age and sex with known parents; grown-ups get an occupation as the world gives one. */
function person(ctx: Ctx, sex: 'male' | 'female', age: number, parents: { father?: string; mother?: string } = {}): Character {
  const c = createCharacter(ctx, { surname: 'Kin', age: { min: age, max: age }, ...parents });
  c.sex = sex;
  if (age >= ctx.content.settings.adultAge) c.occupation = ctx.content.population!.occupations[0]!.id;
  return c;
}

const child = (ctx: Ctx, parent: Character, sex: 'male' | 'female', age: number) => person(ctx, sex, age, parent.sex === 'male' ? { father: parent.id } : { mother: parent.id });
const ids = (cs: Character[]) => cs.map((c) => c.id);

/** Runs the phases of days until one hands control back to the player. */
function runDay(ctx: Ctx): void {
  for (;;) for (const phase of DAY_PHASES) if (phase.run(ctx)) return;
}

describe('the law (D-314)', () => {
  it('the eldest son, then the eldest daughter, before any line below them', () => {
    const { ctx, hero } = setup();
    hero.sex = 'male';
    const daughter = child(ctx, hero, 'female', 30);
    const younger = child(ctx, hero, 'male', 20);
    const elder = child(ctx, hero, 'male', 25);
    const grandson = child(ctx, elder, 'male', 5);
    expect(ids(lawOrder(ctx.state, hero.id))).toEqual([elder.id, younger.id, daughter.id, grandson.id]);
  });

  it('a daughter inherits when there is no son', () => {
    const { ctx, hero } = setup();
    hero.sex = 'female';
    const younger = child(ctx, hero, 'female', 10);
    const elder = child(ctx, hero, 'female', 14);
    expect(heirOf(ctx.state, hero.id)).toEqual({ heir: elder, by: 'law' });
    expect(ids(lawOrder(ctx.state, hero.id))).toEqual([elder.id, younger.id]);
  });

  it('no living children: the line of a dead child, then brothers and sisters, then parents', () => {
    const { ctx, hero } = setup();
    hero.sex = 'male';
    const father = person(ctx, 'male', 70);
    hero.father = father.id;
    const brother = person(ctx, 'male', 35, { father: father.id });
    const nephew = child(ctx, brother, 'male', 10);
    const son = child(ctx, hero, 'male', 30);
    const grandchild = child(ctx, son, 'female', 8);
    kill(ctx, son, 'natural');
    expect(ids(lawOrder(ctx.state, hero.id))).toEqual([grandchild.id, brother.id, nephew.id, father.id]);
    kill(ctx, grandchild, 'natural');
    expect(heirOf(ctx.state, hero.id)?.heir.id).toBe(brother.id);
    kill(ctx, brother, 'natural');
    expect(heirOf(ctx.state, hero.id)?.heir.id).toBe(nephew.id);
    kill(ctx, nephew, 'natural');
    expect(heirOf(ctx.state, hero.id)?.heir.id).toBe(father.id);
  });

  it('the death of the hero hands the house to the heir by law, with the line "by law"', () => {
    const { state, ctx, hero } = setup();
    const son = child(ctx, hero, 'male', 30);
    kill(ctx, hero, 'natural');
    expect(state.playerId).toBe(son.id);
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'succession', subject: son.id, parts: [{ id: son.id }, ' took over by law from ', { id: hero.id }, '.'] });
    expect(checkInvariants(state, quiet)).toEqual([]);
  });

  it('the money: half to the heir, the rest in equal whole parts to the other children and the widow, the remainder to the heir', () => {
    const { state, ctx, hero } = setup();
    hero.sex = 'male';
    const wife = person(ctx, 'female', 40);
    state.marriages.push({ a: hero.id, b: wife.id, start: 0, end: null, endReason: null });
    const heir = child(ctx, hero, 'male', 20);
    const second = child(ctx, hero, 'male', 18);
    const third = child(ctx, hero, 'female', 19);
    for (const c of [wife, heir, second, third]) c.money = 1;
    hero.money = 100;
    kill(ctx, hero, 'natural');
    // 50 stay with the heir; 50 among three: 16 each, the 2 left over to the heir.
    expect([heir.money, second.money, third.money, wife.money]).toEqual([1 + 52, 17, 17, 17]);
  });

  it('debts go to the main heir alone', () => {
    const { ctx, hero } = setup();
    const heir = child(ctx, hero, 'male', 20);
    const other = child(ctx, hero, 'female', 18);
    hero.money = -30;
    kill(ctx, hero, 'natural');
    expect([heir.money, other.money]).toEqual([-30, 0]);
  });
});

describe('the will (D-314, D-360)', () => {
  it('a will at the notary: days of the action, the price, the terms at its end', () => {
    const { state, ctx, hero } = setup();
    const elder = child(ctx, hero, 'male', 20);
    const younger = child(ctx, hero, 'male', 18);
    hero.money = 50;
    const day = state.day;
    apply(state, quiet, { type: 'will', heir: younger.id, guardian: null, items: [] });
    expect(state.day).toBe(day + 5);
    expect(state.will).toEqual({ day: day + 5, heir: younger.id, guardian: null, items: [], stale: false });
    expect(state.willDraft).toBeNull();
    expect(hero.money).toBe(50 - 10);
    expect(state.chronicle.some((e) => e.kind === 'will' && e.level === 'journal')).toBe(true);
    expect(heirOf(state, hero.id)).toEqual({ heir: younger, by: 'will' });
    expect(heirLine(state)).toEqual({ id: younger.id, name: expect.any(String), by: 'by will' });
    expect(checkInvariants(state, quiet)).toEqual([]);
    void elder;
  });

  it('the will overrides the law; the heir by law is passed over and holds it against the new head', () => {
    const { state, ctx, hero } = setup();
    const elder = child(ctx, hero, 'male', 20);
    const younger = child(ctx, hero, 'male', 18);
    state.circle.push(elder.id);
    apply(state, quiet, { type: 'will', heir: younger.id, guardian: null, items: [] });
    kill(ctx, hero, 'natural');
    expect(state.playerId).toBe(younger.id);
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'succession', parts: [{ id: younger.id }, ' took over by the will of ', { id: hero.id }, '.'] });
    expect(opinionCauses(ctx, elder.id, younger.id).map((c) => c.id)).toContain('passed_over');
    expect(state.will).toBeNull();
    expect(state.executedWill).toMatchObject({ heir: younger.id });
    expect(checkInvariants(state, quiet)).toEqual([]);
  });

  it('a named heir who dies leaves the will out of date, and the law decides', () => {
    const { state, ctx, hero } = setup();
    const elder = child(ctx, hero, 'male', 20);
    const younger = child(ctx, hero, 'male', 18);
    apply(state, quiet, { type: 'will', heir: younger.id, guardian: null, items: [] });
    kill(ctx, younger, 'natural');
    expect(state.will).toMatchObject({ heir: null, stale: true });
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'will', level: 'journal' });
    expect(heirLine(state)?.by).toBe('by law');
    kill(ctx, hero, 'natural');
    expect(state.playerId).toBe(elder.id);
  });

  it('a child born after the will makes it out of date', () => {
    const { state, ctx, hero } = setup();
    child(ctx, hero, 'male', 20);
    apply(state, quiet, { type: 'will', heir: null, guardian: null, items: [] });
    const baby = child(ctx, hero, 'female', 0);
    state.day += 1;
    baby.birthDay = state.day;
    state.household.push(baby.id);
    successionPhase.run(ctx);
    expect(state.will?.stale).toBe(true);
  });

  it('an interrupted notary action gives no will and costs nothing', () => {
    const { state, ctx, hero } = setup();
    const son = child(ctx, hero, 'male', 20);
    hero.money = 50;
    apply(state, quiet, { type: 'will', heir: son.id, guardian: null, items: [] });
    const signed = structuredClone(state.will);
    const money = hero.money;
    willCommand(ctx, { heir: null, guardian: null, items: [] });
    expect(state.willDraft).toEqual({ heir: null, guardian: null, items: [] });
    // Cut short on the first day, as an event's `end_action` would.
    state.interruptRequest = { template: null };
    runDay(ctx);
    expect(state.activeAction).toBeNull();
    expect(state.will).toEqual(signed);
    expect(hero.money).toBe(money);
    // The draft left behind is dropped by the next succession phase; it never becomes a will.
    successionPhase.run(ctx);
    expect(state.willDraft).toBeNull();
    expect(checkInvariants(state, quiet)).toEqual([]);
  });

  it('refuses the will of a hero under age, of a hero who cannot pay, and an heir who is not kin', () => {
    const { state, ctx, hero } = setup();
    const stranger = person(ctx, 'male', 30);
    hero.money = 5;
    expect(() => apply(state, quiet, { type: 'will', heir: null, guardian: null, items: [] })).toThrow(/Cannot make a will/);
    hero.money = 50;
    expect(() => apply(state, quiet, { type: 'will', heir: stranger.id, guardian: null, items: [] })).toThrow(/not of the kin/);
    hero.birthDay = state.day - 365 * 10;
    expect(willForm(state, quiet)?.reasons.length).toBeGreaterThan(0);
    expect(() => apply(state, quiet, { type: 'will', heir: null, guardian: null, items: [] })).toThrow(/Cannot make a will/);
    expect(state.willDraft).toBeNull();
    expect(state.activeAction).toBeNull();
  });

  it('a severely ill hero is told so and cannot go to the notary (D-366)', () => {
    const sick: Content = structuredClone(quiet);
    const mortal = sick.health.conditions.find((c) => c.id === 'mortal')!;
    mortal.stages[0]!.severe = true;
    const { state, ctx, hero } = setup(sick);
    child(ctx, hero, 'male', 20);
    hero.money = 50;
    hero.conditions.push({ id: 'mortal', stage: 'fatal', start: state.day } as (typeof hero.conditions)[number]);
    expect(willForm(state, sick)?.reasons).toEqual(['Too ill']);
    expect(() => apply(state, sick, { type: 'will', heir: null, guardian: null, items: [] })).toThrow(/Too ill/);
    expect(botCommand(state, sick, seedRng(1, 7))).not.toMatchObject({ type: 'will' });
  });

  it('the notary action is not offered in the list of actions', () => {
    const { ctx } = setup();
    expect(willForm(ctx.state, quiet)).not.toBeNull();
    expect(botCommand(ctx.state, quiet, seedRng(1, 9))).not.toMatchObject({ actionId: 'notary' });
    expect(willCommandOf('', '')).toEqual({ type: 'will', heir: null, guardian: null, items: [] });
  });
});

describe('the guardian (D-314, D-362)', () => {
  it('a child heir gets the guardian named in the will', () => {
    const { state, ctx, hero } = setup();
    const son = child(ctx, hero, 'male', 9);
    state.household.push(son.id);
    const friend = person(ctx, 'male', 40);
    state.circle.push(friend.id);
    apply(state, quiet, { type: 'will', heir: null, guardian: friend.id, items: [] });
    expect(state.will?.guardian).toBe(friend.id);
    kill(ctx, hero, 'natural');
    expect(state.playerId).toBe(son.id);
    expect(state.guardian).toBe(friend.id);
    expect(activeRelationBetween(state, friend.id, son.id, 'guardian')).toMatchObject({ a: friend.id, b: son.id });
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'guardian', parts: [{ id: friend.id }, ' became the guardian of ', { id: son.id }, '.'] });
    expect(checkInvariants(state, quiet)).toEqual([]);
  });

  it('by law: the living parent, else the eldest grown-up relative, else the friendliest grown-up of the circle', () => {
    const { state, ctx, hero } = setup();
    hero.sex = 'male';
    const mother = person(ctx, 'female', 35);
    const son = person(ctx, 'male', 9, { father: hero.id, mother: mother.id });
    expect(lawGuardian(ctx, son, hero.id)?.id).toBe(mother.id);
    kill(ctx, mother, 'natural');
    const grandpa = person(ctx, 'male', 70);
    hero.father = grandpa.id;
    const uncle = person(ctx, 'male', 40, { father: grandpa.id });
    const aunt = person(ctx, 'female', 45, { father: grandpa.id });
    expect(lawGuardian(ctx, son, hero.id)?.id).toBe(grandpa.id);
    kill(ctx, grandpa, 'natural');
    expect(lawGuardian(ctx, son, hero.id)?.id).toBe(aunt.id);
    kill(ctx, aunt, 'natural');
    kill(ctx, uncle, 'natural');
    const circle = state.circle.map((id) => state.characters.find((c) => c.id === id)!).filter((c) => ageYears(c.birthDay, state.day) >= 16);
    expect(circle.length).toBeGreaterThan(1);
    const best = circle[circle.length - 1]!;
    state.opinionReasons.push({ reason: 'rescue', holder: best.id, target: son.id, day: state.day, value: 90, end: null });
    expect(lawGuardian(ctx, son, hero.id)?.id).toBe(best.id);
  });

  it('the guardianship ends when the hero comes of age; a dead guardian is replaced by the law', () => {
    const { state, ctx, hero } = setup();
    hero.sex = 'male';
    const mother = person(ctx, 'female', 35);
    const son = person(ctx, 'male', 15, { father: hero.id, mother: mother.id });
    const aunt = person(ctx, 'female', 50);
    mother.father = null;
    aunt.father = null;
    state.circle.push(aunt.id);
    kill(ctx, hero, 'natural');
    expect(state.guardian).toBe(mother.id);
    kill(ctx, mother, 'natural');
    expect(state.guardian).not.toBe(mother.id);
    expect(state.guardian).not.toBeNull();
    const guardian = state.guardian as string;
    expect(activeRelationBetween(state, guardian, son.id, 'guardian')).not.toBeNull();
    expect(checkInvariants(state, quiet)).toEqual([]);
    son.birthDay = state.day - 16 * 365 - 5;
    successionPhase.run(ctx);
    expect(state.guardian).toBeNull();
    expect(activeRelationBetween(state, guardian, son.id, 'guardian')).toBeNull();
    expect(checkInvariants(state, quiet)).toEqual([]);
  });

  it('an event that ends the guardianship leaves no guardian; a few days past coming of age break no rule (D-366)', () => {
    const { state, ctx, hero } = setup();
    hero.sex = 'male';
    const mother = person(ctx, 'female', 35);
    const son = person(ctx, 'male', 12, { father: hero.id, mother: mother.id });
    kill(ctx, hero, 'natural');
    expect(state.guardian).toBe(mother.id);
    son.birthDay = state.day - 16 * 365 - 3;
    expect(checkInvariants(state, quiet)).toEqual([]);
    son.birthDay = state.day - 12 * 365;
    endRelation(ctx, state.relations.find((r) => r.kind === 'guardian' && r.end === null)!, 'removed');
    successionPhase.run(ctx);
    expect(state.guardian).toBeNull();
    expect(checkInvariants(state, quiet)).toEqual([]);
  });

  it('a child hero gets only the events bound to the action', () => {
    const content: Content = { ...quiet, narrator: { ...narratorContent(quiet), eventChancePer10k: 10000, longActionChancePer10k: 10000, minDaysBetweenEvents: 0 } };
    const { state, hero } = setup(content);
    const ctx = { state, content };
    const fired = (age: number, actionId: string): string[] => {
      hero.birthDay = state.day - age * 365 - 10;
      const out: string[] = [];
      for (let i = 0; i < 40; i += 1) {
        state.pendingEvent = null;
        state.status = 'awaiting_action';
        state.lastEventDay = null;
        state.activeAction = { actionId, endDay: state.day + 100 };
        narratorPhase.run(ctx);
        if (state.pendingEvent) out.push((state.pendingEvent as { eventId: string }).eventId);
        state.day += 1;
      }
      state.pendingEvent = null;
      return out;
    };
    expect(fired(10, 'rest').every((id) => id === 'rest_only')).toBe(true);
    expect(fired(10, 'wait')).toEqual([]);
    expect(fired(30, 'wait').length).toBeGreaterThan(0);
  });
});

describe('the end of the house (D-315)', () => {
  it('no kin: the house ends with its line, and the run stops', () => {
    const { state, ctx, hero } = setup();
    kill(ctx, hero, 'natural');
    expect(state.status).toBe('ended');
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'house_end', level: 'chronicle', subject: hero.id });
    expect(checkInvariants(state, quiet)).toEqual([]);
    expect(serialize(deserialize(serialize(state), quiet))).toBe(serialize(state));
  });

  it('with temporaryHeir on, the placeholder heir of D-007 comes instead', () => {
    const content = withTemporary(quiet);
    const { state, ctx, hero } = setup(content);
    hero.money = 40;
    kill(ctx, hero, 'natural');
    expect(state.status).toBe('awaiting_action');
    const heir = getPlayer(state);
    expect(heir.id).not.toBe(hero.id);
    expect([heir.surname, heir.money, heir.father]).toEqual([hero.surname, 40, null]);
    expect(ageYears(heir.birthDay, state.day)).toBe(content.settings.heirAge?.min ?? content.settings.adultAge);
  });

  it('`end` while an event waits keeps the lines its effects held back', () => {
    const { state, hero } = setup();
    state.pendingEvent = { eventId: 'ping', protagonist: hero.id, scope: { hero: hero.id, protagonist: hero.id }, seq: 0, page: null, lines: [], money: 0, mark: false, important: false, after: [{ day: state.day, subject: hero.id, kind: 'relation', level: 'chronicle', parts: ['held back'] }] };
    state.status = 'awaiting_choice';
    apply(state, quiet, { type: 'end' });
    expect(state.chronicle.slice(-2).map((e) => e.kind)).toEqual(['relation', 'house_end']);
    expect(state.status).toBe('ended');
  });
});

describe('the bot and the runs', () => {
  it('the bot writes a will when there is kin to name', () => {
    const { state, ctx, hero } = setup();
    child(ctx, hero, 'male', 20);
    hero.money = 1000;
    const rng = seedRng(1, 7);
    const commands = Array.from({ length: 200 }, () => botCommand(state, quiet, rng));
    expect(commands.some((c) => c.type === 'will')).toBe(true);
  });

  it('60 years on the fixture with the placeholder heir: no broken rules', () => {
    const { state } = runSim(withTemporary(loaded), { seed: 2, years: 60 });
    expect(checkInvariants(state, withTemporary(loaded))).toEqual([]);
  });
});
