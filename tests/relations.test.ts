import { describe, expect, it } from 'vitest';
import { botCommand } from '../src/core/bot';
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
    expect(state.lastAcquaintanceDay).not.toBeNull();
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
