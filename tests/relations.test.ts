import { describe, expect, it } from 'vitest';
import { botCommand } from '../src/core/bot';
import { entryText } from '../src/core/chronicle/log';
import { conditionReport, conditionRoleRefs, type When } from '../src/core/condition-keys';
import { applyEffects, effectRoleRefs, type Effects } from '../src/core/effects';
import { chooseOption, fireEvent, findEvent, optionState } from '../src/core/events/events';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { createCharacter, kill } from '../src/core/lifecycle';
import {
  acquaintanceLevel,
  acquaintanceWeek,
  introduce,
} from '../src/core/relations/acquaintance';
import { endRelation, activeRelationBetween, relationsOf, startRelation } from '../src/core/relations/links';
import {
  addOpinionReason,
  endHeldReasons,
  opinionCauses,
  opinionValue,
  opinionWord,
  removeOpinionReason,
} from '../src/core/relations/opinions';
import { addSecret, revealSecret, secretsAbout, secretsKnownBy } from '../src/core/relations/secrets';
import { narratorContent } from '../src/core/narrator/content';
import { seedRng } from '../src/core/rng';
import { deserialize, serialize } from '../src/core/save/save';
import type { Character, Ctx, GameState } from '../src/core/state';
import { fromYmd, START_YEAR } from '../src/core/time/calendar';
import { BASE_FILES, loadOrThrow } from './fixtures/content';
import { readContentFiles } from '../tools/content-files';

const content = loadOrThrow([
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions'),
]);
const ctxOf = (state: GameState): Ctx => ({ state, content });

/** A game after the first day, so the circle exists; returns the hero and two people of the circle with set traits. */
function setup(seed = 3): { state: GameState; ctx: Ctx; hero: Character; x: Character; y: Character } {
  const state = newGame(seed, content);
  apply(state, content, { type: 'start', actionId: 'rest' });
  state.acquaintances.length = 0;
  const ctx = ctxOf(state);
  const [x, y] = state.circle.map((id) => state.characters.find((c) => c.id === id) as Character);
  return { state, ctx, hero: getPlayer(state), x: x as Character, y: y as Character };
}

describe('opinions', () => {
  it('fade over their term and are not recounted daily', () => {
    const { state, ctx, x, y } = setup();
    x.traits = [];
    y.traits = [];
    addOpinionReason(ctx, x.id, y.id, 'slight');
    const d0 = state.day;
    expect(opinionValue(ctx, x.id, y.id, d0)).toBe(-40);
    expect(opinionValue(ctx, x.id, y.id, d0 + 50)).toBe(-20);
    expect(opinionValue(ctx, x.id, y.id, d0 + 100)).toBe(0);
    expect(opinionValue(ctx, x.id, y.id, d0 + 5000)).toBe(0);
    // the other direction is untouched
    expect(opinionValue(ctx, y.id, x.id, d0)).toBe(0);
  });

  it('never fade when the reason says so', () => {
    const { state, ctx, x, y } = setup();
    x.traits = [];
    y.traits = [];
    addOpinionReason(ctx, x.id, y.id, 'insult');
    expect(opinionValue(ctx, x.id, y.id, state.day + 100000)).toBe(-60);
  });

  it('are forgotten faster, or never, depending on the traits of the holder', () => {
    const { state, ctx, x, y } = setup();
    y.traits = [];
    addOpinionReason(ctx, x.id, y.id, 'slight');
    const d = state.day + 25;
    x.traits = [];
    expect(opinionValue(ctx, x.id, y.id, d)).toBe(-30);
    x.traits = ['forgiving'];
    expect(opinionValue(ctx, x.id, y.id, d)).toBe(-20);
    expect(opinionValue(ctx, x.id, y.id, state.day + 50)).toBe(0);
    x.traits = ['vengeful'];
    expect(opinionValue(ctx, x.id, y.id, state.day + 100000)).toBe(-40);
  });

  it('weigh favours by the generosity of the holder', () => {
    const { state, ctx, x, y } = setup();
    y.traits = [];
    addOpinionReason(ctx, x.id, y.id, 'gift');
    x.traits = ['generous'];
    expect(opinionValue(ctx, x.id, y.id, state.day)).toBe(10);
    x.traits = ['greedy'];
    expect(opinionValue(ctx, x.id, y.id, state.day)).toBe(30);
  });

  it('stay within -100 and 100', () => {
    const { state, ctx, x, y } = setup();
    x.traits = ['greedy'];
    y.traits = [];
    addOpinionReason(ctx, x.id, y.id, 'rescue');
    addOpinionReason(ctx, x.id, y.id, 'gift');
    expect(opinionValue(ctx, x.id, y.id, state.day)).toBe(100);
    x.traits = [];
    addOpinionReason(ctx, y.id, x.id, 'insult');
    addOpinionReason(ctx, y.id, x.id, 'slight', -100);
    expect(opinionValue(ctx, y.id, x.id, state.day)).toBe(-100);
  });

  it('take a similarity background from the traits, limited by its maximum', () => {
    const { state, ctx, x, y } = setup();
    x.traits = ['proud'];
    y.traits = ['proud'];
    expect(opinionValue(ctx, x.id, y.id)).toBe(-8);
    y.traits = ['humble'];
    expect(opinionValue(ctx, x.id, y.id)).toBe(-5);
    x.traits = ['proud', 'brave'];
    y.traits = ['proud', 'humble', 'brave'];
    // -8 -5 +6 = -7: within the limit of 10
    expect(opinionValue(ctx, x.id, y.id)).toBe(-7);
    expect(opinionCauses(ctx, x.id, y.id)).toEqual([{ id: 'background', value: -7 }]);
    expect(state.opinionReasons).toEqual([]);
  });

  it('refuse a value that breaks the limits or the sign of the reason', () => {
    const { ctx, x, y } = setup();
    for (const bad of [0, 150, 1.5, 10]) expect(() => addOpinionReason(ctx, x.id, y.id, 'slight', bad)).toThrow(/cannot have the value/);
    expect(addOpinionReason(ctx, x.id, y.id, 'slight', -5).value).toBe(-5);
  });

  it('ignore a reason on days before it was given', () => {
    const { state, ctx, x, y } = setup();
    x.traits = [];
    y.traits = [];
    addOpinionReason(ctx, x.id, y.id, 'slight');
    expect(opinionValue(ctx, x.id, y.id, state.day - 1)).toBe(0);
    addOpinionReason(ctx, x.id, y.id, 'insult');
    addOpinionReason(ctx, x.id, y.id, 'debt');
    x.traits = ['vengeful'];
    expect(opinionValue(ctx, x.id, y.id, state.day - 1)).toBe(0);
    expect(opinionValue(ctx, x.id, y.id, state.day)).toBe(-70);
  });

  it('count a relation only between its dates', () => {
    const { state, ctx, x, y } = setup();
    x.traits = [];
    y.traits = [];
    const rel = startRelation(ctx, 'friend', x.id, y.id);
    const start = state.day;
    state.day += 10;
    endRelation(ctx, rel, 'drifted');
    expect(opinionValue(ctx, x.id, y.id, start - 1)).toBe(0);
    expect(opinionValue(ctx, x.id, y.id, start + 5)).toBe(25);
    expect(opinionValue(ctx, x.id, y.id, start + 10)).toBe(0);
  });

  it('refresh a reason that still counts instead of doubling it', () => {
    const { state, ctx, x, y } = setup();
    x.traits = [];
    y.traits = [];
    addOpinionReason(ctx, x.id, y.id, 'slight');
    state.day += 50;
    addOpinionReason(ctx, x.id, y.id, 'slight');
    expect(state.opinionReasons).toHaveLength(1);
    expect(opinionValue(ctx, x.id, y.id)).toBe(-40);
  });

  it('end by name for held reasons, or one at a time', () => {
    const { state, ctx, x, y } = setup();
    x.traits = [];
    y.traits = [];
    addOpinionReason(ctx, x.id, y.id, 'debt');
    addOpinionReason(ctx, x.id, y.id, 'insult');
    expect(opinionValue(ctx, x.id, y.id)).toBe(-30);
    expect(endHeldReasons(ctx, 'repaid')).toBe(1);
    expect(endHeldReasons(ctx, 'repaid')).toBe(0);
    state.day += 1;
    expect(opinionValue(ctx, x.id, y.id)).toBe(-60);
    expect(removeOpinionReason(ctx, x.id, y.id, 'insult')).toBe(true);
    expect(removeOpinionReason(ctx, x.id, y.id, 'insult')).toBe(false);
    expect(opinionValue(ctx, x.id, y.id)).toBe(0);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('are put in words', () => {
    expect([-100, -51, -50, -11, -10, 9, 10, 49, 50, 100].map((v) => opinionWord(content, v))).toEqual([
      'hatred', 'hatred', 'dislike', 'dislike', 'indifference', 'indifference', 'liking', 'liking', 'devotion', 'devotion',
    ]);
  });

  it('are not kept for people outside the hero circle, nor for oneself', () => {
    const { state, ctx, x } = setup();
    const far = createCharacter(ctx, { surname: 'Far', age: { min: 30, max: 30 } });
    const far2 = createCharacter(ctx, { surname: 'Far', age: { min: 30, max: 30 } });
    state.circle = state.circle.filter((id) => id !== far.id && id !== far2.id);
    expect(() => addOpinionReason(ctx, far.id, far2.id, 'slight')).toThrow(/outside/);
    expect(() => addOpinionReason(ctx, x.id, x.id, 'slight')).toThrow(/themself/);
    expect(() => addOpinionReason(ctx, x.id, far.id, 'nope')).toThrow(/Unknown opinion reason/);
    // one side in the circle is enough: the dead killer's victim's kin
    expect(addOpinionReason(ctx, x.id, far.id, 'slight').holder).toBe(x.id);
  });

  it('add the standing opinion of an active relation, from the side of each', () => {
    const { ctx, x, y } = setup();
    x.traits = [];
    y.traits = [];
    const pact = startRelation(ctx, 'patron', x.id, y.id);
    expect(opinionValue(ctx, x.id, y.id)).toBe(10);
    expect(opinionValue(ctx, y.id, x.id)).toBe(20);
    endRelation(ctx, pact, 'fell_out');
    expect(opinionValue(ctx, x.id, y.id)).toBe(0);
    startRelation(ctx, 'rival', y.id, x.id);
    expect(opinionValue(ctx, x.id, y.id)).toBe(-30);
    expect(opinionValue(ctx, y.id, x.id)).toBe(-30);
  });
});

describe('relations', () => {
  it('refuse a relation with oneself, with the dead, with an unknown kind and a second active one', () => {
    const { state, ctx, x, y } = setup();
    expect(() => startRelation(ctx, 'friend', x.id, x.id)).toThrow(/themself/);
    expect(() => startRelation(ctx, 'blood_brother', x.id, y.id)).toThrow(/Unknown relation kind/);
    startRelation(ctx, 'friend', x.id, y.id);
    expect(() => startRelation(ctx, 'friend', y.id, x.id)).toThrow(/already/);
    // another kind between the same two is allowed
    startRelation(ctx, 'rival', x.id, y.id);
    expect(relationsOf(state, x.id)).toHaveLength(2);
    const z = state.characters.find((c) => c.id === state.circle[2]) as Character;
    kill(ctx, z, 'illness');
    expect(() => startRelation(ctx, 'friend', x.id, z.id)).toThrow(/dead/);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('are closed by death and stay on record with their reason', () => {
    const { state, ctx, x, y } = setup();
    const friendship = startRelation(ctx, 'friend', x.id, y.id);
    const day = state.day;
    kill(ctx, y, 'illness');
    expect(friendship.end).toBe(day);
    expect(friendship.endReason).toBe('death');
    expect(relationsOf(state, x.id)).toEqual([]);
    expect(state.relations).toContain(friendship);
    expect(activeRelationBetween(state, x.id, y.id)).toBeNull();
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('can be started again after they ended, and cannot end twice', () => {
    const { ctx, x, y } = setup();
    const first = startRelation(ctx, 'friend', x.id, y.id);
    endRelation(ctx, first, 'betrayal');
    expect(() => endRelation(ctx, first, 'betrayal')).toThrow(/already ended/);
    const second = startRelation(ctx, 'friend', x.id, y.id);
    expect(second.id).not.toBe(first.id);
  });

  it('are not kept between two people outside the circle', () => {
    const { state, ctx } = setup();
    const a = createCharacter(ctx, { surname: 'Far', age: { min: 30, max: 30 } });
    const b = createCharacter(ctx, { surname: 'Far', age: { min: 30, max: 30 } });
    state.circle = state.circle.filter((id) => id !== a.id && id !== b.id);
    expect(() => startRelation(ctx, 'friend', a.id, b.id)).toThrow(/outside/);
  });

  it('are checked by the invariants', () => {
    const { state, ctx, x, y } = setup();
    const rel = startRelation(ctx, 'friend', x.id, y.id);
    state.relations.push({ ...rel, id: 'r999', a: y.id, b: x.id });
    expect(checkInvariants(state, content).join('\n')).toMatch(/second active friend/);
    state.relations.pop();
    rel.b = rel.a;
    expect(checkInvariants(state, content).join('\n')).toMatch(/related to themself/);
    rel.b = y.id;
    rel.end = state.day;
    expect(checkInvariants(state, content).join('\n')).toMatch(/end and end reason/);
    rel.end = null;
    rel.kind = 'unknown';
    expect(checkInvariants(state, content).join('\n')).toMatch(/unknown kind/);
    rel.kind = 'friend';
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('catch bad opinions, acquaintances and secrets', () => {
    const { state, ctx, hero, x } = setup();
    addOpinionReason(ctx, x.id, hero.id, 'slight');
    state.opinionReasons[0] = { ...(state.opinionReasons[0] as (typeof state.opinionReasons)[0]), target: x.id };
    expect(checkInvariants(state, content).join('\n')).toMatch(/opinion of themself/);
    state.opinionReasons.length = 0;
    state.acquaintances.push({ holder: hero.id, other: x.id, level: 'known', since: 0, closeSince: null });
    state.acquaintances.push({ holder: hero.id, other: x.id, level: 'known', since: 0, closeSince: null });
    expect(checkInvariants(state, content).join('\n')).toMatch(/listed twice/);
    state.acquaintances.length = 0;
    state.acquaintances.push({ holder: hero.id, other: hero.id, level: 'close', since: 0, closeSince: null });
    expect(checkInvariants(state, content).join('\n')).toMatch(/knows themself/);
    state.acquaintances.length = 0;
    const s = addSecret(ctx, x.id, 'crime', [x.id, x.id]);
    expect(s.knownBy).toEqual([x.id]);
    s.knownBy.push(x.id);
    expect(checkInvariants(state, content).join('\n')).toMatch(/listed twice/);
  });
});

describe('acquaintance', () => {
  it('begins as none, is made by meeting, and never goes down', () => {
    const { state, ctx, hero, x } = setup();
    expect(acquaintanceLevel(state, content, hero.id, x.id)).toBeNull();
    expect(introduce(ctx, x.id)).toBe(true);
    expect(introduce(ctx, x.id)).toBe(false);
    expect(acquaintanceLevel(state, content, hero.id, x.id)).toBe('known');
    expect(introduce(ctx, x.id, 'close')).toBe(true);
    expect(introduce(ctx, x.id, 'known')).toBe(false);
    expect(acquaintanceLevel(state, content, hero.id, x.id)).toBe('close');
    expect(() => introduce(ctx, hero.id)).toThrow(/themself/);
  });

  it('comes from the people of the circle, one a week at most, closer after enough time', () => {
    const { state, ctx, hero } = setup();
    const before = state.acquaintances.length;
    acquaintanceWeek(ctx);
    expect(state.acquaintances.length).toBe(before + 1);
    const first = state.acquaintances[before] as (typeof state.acquaintances)[0];
    expect(first.holder).toBe(hero.id);
    expect(state.circle).toContain(first.other);
    expect(first.level).toBe('known');
    // fixture: close after 30 days, always taken when the week comes
    state.day += 35;
    acquaintanceWeek(ctx);
    expect(first.level).toBe('close');
    expect(first.closeSince).toBe(state.day);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('is given at least by the kind of an active relation', () => {
    const { state, ctx, hero, x } = setup();
    expect(acquaintanceLevel(state, content, hero.id, x.id)).toBeNull();
    const rivalry = startRelation(ctx, 'rival', hero.id, x.id);
    expect(acquaintanceLevel(state, content, hero.id, x.id)).toBe('known');
    endRelation(ctx, rivalry, 'reconciled');
    startRelation(ctx, 'friend', x.id, hero.id);
    expect(acquaintanceLevel(state, content, hero.id, x.id)).toBe('close');
  });

  it('runs once a week of the game, on its own, in the day loop', () => {
    const { state, hero } = setup();
    const start = state.day;
    while (state.day < start + 70) apply(state, content, { type: 'start', actionId: 'rest' });
    const weeks = Math.floor(state.day / 7) - Math.floor(start / 7);
    const mine = state.acquaintances.filter((a) => a.holder === hero.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.length).toBeLessThanOrEqual(weeks + 1);
  });
});

describe('secrets', () => {
  it('have a list of people who know them', () => {
    const { state, ctx, x, y, hero } = setup();
    const s = addSecret(ctx, x.id, 'affair', [x.id, y.id]);
    expect(s.knownBy).toEqual([x.id, y.id]);
    expect(revealSecret(ctx, s, hero.id)).toBe(true);
    expect(revealSecret(ctx, s, hero.id)).toBe(false);
    expect(secretsKnownBy(state, hero.id)).toEqual([s]);
    expect(secretsAbout(state, x.id)).toEqual([s]);
    expect(secretsAbout(state, y.id)).toEqual([]);
    expect(() => addSecret(ctx, 'c99999', 'affair', [])).toThrow(/Unknown character/);
    expect(checkInvariants(state, content)).toEqual([]);
  });
});

describe('a long game', () => {
  it('keeps the invariants for 60 years, saves and loads the same, and meets people only around the hero', () => {
    const state = newGame(11, content);
    const bot = seedRng(11, 1);
    const end = fromYmd(START_YEAR + 60, 1, 1);
    while (state.day < end) {
      apply(state, content, botCommand(state, content, bot));
      expect(checkInvariants(state, content)).toEqual([]);
    }
    const heroes = new Set(state.acquaintances.map((a) => a.holder));
    expect(heroes.size).toBeGreaterThan(0);
    for (const h of heroes) expect(state.characters.find((c) => c.id === h)).toBeDefined();
    expect(state.opinionReasons).toEqual([]);
    const copy = deserialize(serialize(state), content);
    expect(copy.acquaintances).toEqual(state.acquaintances);
  });

  it('is the same game twice', () => {
    const run = () => {
      const state = newGame(4, content);
      const bot = seedRng(4, 1);
      while (state.day < fromYmd(START_YEAR + 15, 1, 1)) apply(state, content, botCommand(state, content, bot));
      return state.acquaintances;
    };
    expect(run()).toEqual(run());
  });
});

// Opinions, relations and secrets in events (3.6, D-220…D-225): the keys see people only through the scope of roles.
const eventContent = loadOrThrow([
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions'),
  ...readContentFiles('tests/fixtures/relations'),
]);

function eventGame(seed = 3) {
  const state = newGame(seed, eventContent);
  apply(state, eventContent, { type: 'start', actionId: 'rest' });
  state.acquaintances.length = 0;
  const ctx: Ctx = { state, content: eventContent };
  const hero = getPlayer(state);
  hero.traits = [];
  const [x, y, z] = state.circle.map((id) => state.characters.find((c) => c.id === id) as Character);
  for (const c of [x, y, z]) (c as Character).traits = [];
  return { state, ctx, hero, x: x as Character, y: y as Character, z: z as Character };
}

/** Chooses an option of the pending event; the status is the one `apply` leaves after a choice with nothing pending. */
function choose(ctx: Ctx, option: number): void {
  chooseOption(ctx, option);
  if (!ctx.state.pendingEvent) ctx.state.status = 'awaiting_action';
}

/** Fires an event and returns who took which role: the engine chooses the people (3.3). */
function fire(ctx: Ctx, id: string) {
  const hero = getPlayer(ctx.state);
  expect(fireEvent(ctx, findEvent(eventContent, id), hero)).toBe('waiting');
  const scope = ctx.state.pendingEvent!.scope;
  const who = (role: string) => ctx.state.characters.find((c) => c.id === scope[role]) as Character;
  return { hero, scope, who };
}

const relationLines = (state: GameState) => state.chronicle.filter((e) => e.kind === 'relation').map(entryText);

describe('effects of events on roles', () => {
  it('apply through `on` and the scope: opinions, a tie with its chronicle line, a secret, an introduction', () => {
    const { state, ctx } = eventGame();
    const { hero, who, scope } = fire(ctx, 'quarrel');
    const [foe, witness] = [who('foe'), who('witness')];
    expect(witness).toBeDefined();
    choose(ctx, 0);
    expect(opinionCauses(ctx, hero.id, foe.id).map((c) => c.id)).toContain('slight');
    expect(opinionCauses(ctx, foe.id, hero.id).map((c) => c.id)).toEqual(expect.arrayContaining(['insult', 'relation']));
    expect(activeRelationBetween(state, hero.id, foe.id, 'rival')).not.toBeNull();
    expect(relationLines(state)).toEqual([expect.stringMatching(/ became rivals\.$/)]);
    const line = state.chronicle.find((e) => e.kind === 'relation')!;
    expect(line.subject).toBe(hero.id);
    expect(line.level).toBe('chronicle');
    expect(line.parts).toContainEqual({ id: foe.id, name: `${foe.givenName} ${foe.surname}` });
    expect(secretsAbout(state, foe.id)[0]).toMatchObject({ kind: 'shame', knownBy: [foe.id, witness.id, hero.id] });
    expect(acquaintanceLevel(state, eventContent, hero.id, witness.id)).toBe('close');
    expect(acquaintanceLevel(state, eventContent, hero.id, foe.id)).toBe('known');
    expect(scope.foe).toBe(foe.id);
    expect(checkInvariants(state, eventContent)).toEqual([]);
  });

  it('show an option grey until the relation exists, then end it with a reason, take a reason away, reveal a secret', () => {
    const { state, ctx } = eventGame();
    const first = fire(ctx, 'quarrel');
    const peace = findEvent(eventContent, 'quarrel').options![1]!;
    expect(optionState(ctx, peace, first.hero, first.scope)).toMatchObject({ available: false, hidden: false, reasons: [expect.stringMatching(/^Needs rival with /)] });
    choose(ctx, 0);
    const foe = first.who('foe');
    const witness = first.who('witness');
    expect(witness).toBeDefined();
    // the rival comes to make peace: the role is picked by the tie
    const second = fire(ctx, 'reconcile');
    expect(second.scope.foe).toBe(foe.id);
    const secret = secretsAbout(state, foe.id)[0]!;
    secret.knownBy = [foe.id];
    choose(ctx, 0);
    expect(activeRelationBetween(state, first.hero.id, foe.id, 'rival')).toBeNull();
    expect(state.relations[0]).toMatchObject({ kind: 'rival', endReason: 'peace' });
    expect(opinionCauses(ctx, foe.id, first.hero.id).map((c) => c.id)).not.toContain('insult');
    expect(secret.knownBy).toContain(second.scope.witness);
    expect(relationLines(state).map((t) => t.replace(/^.*? (became|made)/, '$1'))).toEqual(['became rivals.', 'made peace.']);
  });

  it('give the patron and the protege their own line and keep the patron first', () => {
    const { state, ctx } = eventGame();
    const one = fire(ctx, 'kindness');
    choose(ctx, 0);
    const x = one.who('pupil');
    expect(state.relations[0]).toMatchObject({ kind: 'patron', a: one.hero.id, b: x.id });
    expect(opinionCauses(ctx, x.id, one.hero.id).find((c) => c.id === 'gift')?.value).toBe(55);
    const two = fire(ctx, 'kindness');
    const y = two.who('pupil');
    choose(ctx, 1);
    expect(state.relations[1]).toMatchObject({ kind: 'patron', a: y.id, b: one.hero.id });
    expect(relationLines(state).map((t) => /wing/.test(t))).toEqual([true, false]);
    expect(relationLines(state)[1]).toMatch(/took .* in\.$/);
    // the end of the tie is applied with the scope written by hand: the engine would pick the pupil again
    const drop = findEvent(eventContent, 'kindness').options![2]!;
    applyEffects(ctx, one.hero, drop.effects as Effects, { hero: one.hero.id, protagonist: one.hero.id, pupil: x.id });
    expect(state.relations[0]?.endReason).toBe('event');
    expect(relationLines(state)[2]).toMatch(/dropped/);
    expect(checkInvariants(state, eventContent)).toEqual([]);
  });

  it('end a held reason by the name it waits for', () => {
    const { state, ctx } = eventGame();
    const one = fire(ctx, 'kindness');
    choose(ctx, 3);
    const x = one.who('pupil');
    expect(opinionCauses(ctx, x.id, one.hero.id).map((c) => c.id)).toContain('debt');
    const repaid = findEvent(eventContent, 'kindness').options![4]!;
    applyEffects(ctx, x, repaid.on!.pupil as Effects, { hero: one.hero.id, protagonist: one.hero.id, pupil: x.id });
    expect(opinionCauses(ctx, x.id, one.hero.id).map((c) => c.id)).not.toContain('debt');
    expect(state.opinionReasons[0]?.end).toBe(state.day);
  });

  it('skip what has no one to act on, without errors: an empty role, oneself, a tie that exists or does not', () => {
    const { state, ctx, hero, x } = eventGame();
    const effects = {
      opinion: [{ toward: 'ghost', reason: 'slight' }, { toward: 'protagonist', reason: 'slight' }],
      relation: [{ start: 'friend', with: 'ghost' }, { end: 'friend', with: 'other' }],
      secret: { kind: 'shame', known_by: ['ghost'] },
      reveal: { kind: 'shame', to: ['ghost'] },
    } as Effects;
    expect(() => applyEffects(ctx, x, effects, { hero: hero.id, protagonist: x.id, other: hero.id })).not.toThrow();
    expect(state.opinionReasons).toEqual([]);
    expect(state.relations).toEqual([]);
    expect(secretsAbout(state, x.id)[0]?.knownBy).toEqual([x.id]);
    const start = { relation: [{ start: 'friend', with: 'other' }] } as Effects;
    applyEffects(ctx, x, start, { hero: hero.id, protagonist: x.id, other: hero.id });
    applyEffects(ctx, x, start, { hero: hero.id, protagonist: x.id, other: hero.id });
    expect(state.relations).toHaveLength(1);
    kill(ctx, getPlayer(state) === hero ? x : hero, 'illness');
    applyEffects(ctx, x, { relation: [{ start: 'rival', with: 'other' }] } as Effects, { hero: hero.id, protagonist: x.id, other: hero.id });
    expect(state.relations.filter((r) => r.kind === 'rival')).toEqual([]);
  });

  it('name their roles for the cross-check of events', () => {
    const effects = {
      opinion: [{ toward: 'a', reason: 'x' }],
      opinion_end: [{ toward: 'b', reason: 'x' }],
      relation: [{ start: 'friend', with: 'c' }],
      secret: { kind: 'k', known_by: ['d'] },
      reveal: { kind: 'k', to: ['e'] },
      later: [{ after_days: 3, effects: { opinion: [{ toward: 'f', reason: 'x' }] } }],
    } as Effects;
    expect(effectRoleRefs(effects)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    const when = { opinion: { toward: 'a', min: 1 }, relation: { kind: 'friend', with: 'b' }, relation_none: { kind: 'rival', with: 'c' } } as When;
    expect(conditionRoleRefs(when)).toEqual(['a', 'b', 'c']);
  });
});

describe('conditions on opinions and relations', () => {
  const scopeOf = (hero: Character, ...more: [string, Character][]) => ({ hero: hero.id, protagonist: hero.id, ...Object.fromEntries(more.map(([r, c]) => [r, c.id])) });

  it('compare the opinion of the character about a role with the bounds and say why not', () => {
    const { ctx, hero, x } = eventGame();
    const scope = scopeOf(hero, ['foe', x]);
    addOpinionReason(ctx, hero.id, x.id, 'gift');
    const rule = (opinion: object) => conditionReport(ctx, hero, { opinion } as When, scope);
    expect(rule({ toward: 'foe', min: 10, max: 30 })).toMatchObject({ met: true });
    expect(rule({ toward: 'foe', min: 50 })).toMatchObject({ met: false, reasons: [`Needs devotion towards ${x.givenName} ${x.surname}`] });
    expect(rule({ toward: 'foe', max: 10 }).reasons).toEqual([expect.stringMatching(/^Needs at most liking towards /)]);
  });

  it('hide the reason when the character is a stranger to the hero, but not the check itself', () => {
    const { state, ctx, hero, x, y } = eventGame();
    const scope = scopeOf(hero, ['other', y]);
    addOpinionReason(ctx, x.id, y.id, 'insult');
    const when = { opinion: { toward: 'other', max: -50 } } as When;
    expect(conditionReport(ctx, x, when, scope)).toEqual({ met: true, reasons: [], hidden: false });
    const unmet = { opinion: { toward: 'other', min: 10 } } as When;
    expect(conditionReport(ctx, x, unmet, scope)).toEqual({ met: false, reasons: [], hidden: true });
    introduce(ctx, x.id);
    expect(conditionReport(ctx, x, unmet, scope)).toMatchObject({ met: false, hidden: false });
    expect(state.acquaintances).toHaveLength(1);
  });

  it('look at a relation of either side, and at its absence', () => {
    const { ctx, hero, x, y } = eventGame();
    startRelation(ctx, 'patron', x.id, hero.id);
    const scope = scopeOf(hero, ['x', x], ['y', y]);
    const report = (when: object) => conditionReport(ctx, hero, when as When, scope);
    expect(report({ relation: { kind: 'patron', with: 'x' } }).met).toBe(true);
    expect(report({ relation: { kind: 'friend', with: 'x' } }).reasons).toEqual([expect.stringMatching(/^Needs friend with /)]);
    expect(report({ relation_none: { kind: 'friend', with: 'x' } }).met).toBe(true);
    expect(report({ relation_none: { kind: 'patron', with: 'x' } }).reasons).toEqual([expect.stringMatching(/^No patron with /)]);
    expect(report({ relation: { kind: 'patron', with: 'y' } }).met).toBe(false);
  });

  it('are never met for an empty role, and the reason stays hidden', () => {
    const { ctx, hero } = eventGame();
    const scope = scopeOf(hero);
    for (const when of [{ opinion: { toward: 'nobody', max: 100 } }, { relation: { kind: 'friend', with: 'nobody' } }, { relation_none: { kind: 'friend', with: 'nobody' } }]) {
      expect(conditionReport(ctx, hero, when as When, scope)).toEqual({ met: false, reasons: [], hidden: true });
    }
  });

  it('ask how well the hero knows the character', () => {
    const { ctx, hero, x } = eventGame();
    const scope = scopeOf(hero);
    const known = { acquainted: 'known' } as When;
    const close = { acquainted: 'close' } as When;
    expect(conditionReport(ctx, x, known, scope).reasons).toEqual([`Know ${x.givenName} ${x.surname}`]);
    expect(conditionReport(ctx, hero, close, scope).met).toBe(true);
    introduce(ctx, x.id);
    expect([known, close].map((w) => conditionReport(ctx, x, w, scope).met)).toEqual([true, false]);
    introduce(ctx, x.id, 'close');
    expect(conditionReport(ctx, x, close, scope).met).toBe(true);
  });
});

describe('events with relations over a long game', () => {
  // only the events of the fixture, often, so that the people of the circle meet them
  const long = {
    ...eventContent,
    events: eventContent.events.filter((e) => ['quarrel', 'reconcile', 'kindness'].includes(e.id)),
    narrator: { ...narratorContent(eventContent), eventChancePer10k: 300 },
  };
  const run = (seed: number) => {
    const state = newGame(seed, long);
    const bot = seedRng(seed, 1);
    while (state.day < fromYmd(START_YEAR + 40, 1, 1)) {
      apply(state, long, botCommand(state, long, bot));
      expect(checkInvariants(state, long)).toEqual([]);
    }
    return state;
  };

  it('keep the invariants, are the same twice and survive saving', () => {
    const a = run(8);
    expect(a.relations.length + a.opinionReasons.length).toBeGreaterThan(0);
    expect(run(8).relations).toEqual(a.relations);
    expect(deserialize(serialize(a), long).relations).toEqual(a.relations);
  });
});
