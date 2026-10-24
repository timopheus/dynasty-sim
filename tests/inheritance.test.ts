import { describe, expect, it } from 'vitest';
import { entryText } from '../src/core/chronicle/log';
import type { Content } from '../src/core/content/schema';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { createCharacter, kill } from '../src/core/lifecycle';
import { narratorContent } from '../src/core/narrator/content';
import { activeRelationBetween } from '../src/core/relations/links';
import { acquaintanceLevel } from '../src/core/relations/acquaintance';
import { addOpinionReason, opinionCauses, opinionValue } from '../src/core/relations/opinions';
import { startRelation } from '../src/core/relations/links';
import { introduce } from '../src/core/relations/acquaintance';
import { deserialize, serialize } from '../src/core/save/save';
import { heirOf } from '../src/core/succession/law';
import { runSim } from '../src/core/sim';
import type { Character, Ctx, GameState } from '../src/core/state';
import { storiesPhase } from '../src/core/stories/phases';
import { isStoryOpen } from '../src/core/stories/stories';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, loadOrThrow } from './fixtures/content';
import { fireEvent, findEvent } from '../src/core/events/events';
import { play } from '../src/core/game';

/** Base, population, the trait set, the succession and house fixtures and the opinions of 4.8; the stories fixture adds the events. */
const loaded = loadOrThrow([
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions').filter((f) => f.path.endsWith('traits.yaml')),
  ...readContentFiles('tests/fixtures/succession').filter((f) => f.path.endsWith('succession.yaml')),
  ...readContentFiles('tests/fixtures/house'),
  ...readContentFiles('tests/fixtures/inheritance'),
  ...readContentFiles('tests/fixtures/stories'),
]);
/** No events of the narrator unless a test asks. */
const content: Content = { ...loaded, narrator: { ...narratorContent(loaded), eventChancePer10k: 0, longActionChancePer10k: 0, npcChancePer10k: 0 } };

function setup(seed = 3): { state: GameState; ctx: Ctx; hero: Character } {
  const state = newGame(seed, content);
  state.circle = [];
  const hero = getPlayer(state);
  hero.sex = 'male';
  return { state, ctx: { state, content }, hero };
}

function person(ctx: Ctx, age: number, parents: { father?: string; mother?: string } = {}): Character {
  const c = createCharacter(ctx, { surname: 'Kin', age: { min: age, max: age }, ...parents });
  c.sex = 'male';
  c.occupation = 'porter';
  return c;
}

function circleMember(ctx: Ctx): Character {
  const c = person(ctx, 30);
  ctx.state.circle.push(c.id);
  return c;
}

/** A hero with an adult son (not in the household): the heir by law. */
function withSon(): ReturnType<typeof setup> & { son: Character } {
  const s = setup();
  const son = person(s.ctx, 25, { father: s.hero.id });
  return { ...s, son };
}

const texts = (state: GameState) => state.chronicle.map((e) => entryText(e));

describe('enmity and debts pass to the heir (D-035)', () => {
  it('whoever held a reason against the dead head holds the weaker one against the heir', () => {
    const { ctx, hero, son } = withSon();
    const enemy = circleMember(ctx);
    const friend = circleMember(ctx);
    addOpinionReason(ctx, enemy.id, hero.id, 'insult');
    addOpinionReason(ctx, friend.id, hero.id, 'debt');
    kill(ctx, hero, 'fever');
    expect(getPlayer(ctx.state).id).toBe(son.id);
    expect(opinionCauses(ctx, enemy.id, son.id)).toContainEqual({ id: 'father_enemy', value: -25 });
    expect(opinionCauses(ctx, friend.id, son.id)).toContainEqual({ id: 'father_debt', value: 10 });
    expect(checkInvariants(ctx.state, content)).toEqual([]);
  });

  it('a reason that no longer counts passes nothing; a reason without inherits_as passes nothing', () => {
    const { ctx, hero, son } = withSon();
    const a = circleMember(ctx);
    const b = circleMember(ctx);
    addOpinionReason(ctx, a.id, hero.id, 'slight'); // no inherits_as
    addOpinionReason(ctx, b.id, hero.id, 'debt');
    ctx.state.opinionReasons.find((r) => r.holder === b.id)!.end = 0; // repaid
    ctx.state.day = 5;
    kill(ctx, hero, 'fever');
    expect(opinionCauses(ctx, a.id, son.id).map((c) => c.id)).not.toContain('father_enemy');
    expect(opinionCauses(ctx, b.id, son.id).map((c) => c.id)).not.toContain('father_debt');
  });

  it('a debt of honour held until repaid ends for the heir the same way', () => {
    const { ctx, hero, son } = withSon();
    const friend = circleMember(ctx);
    addOpinionReason(ctx, friend.id, hero.id, 'debt');
    kill(ctx, hero, 'fever');
    expect(opinionCauses(ctx, friend.id, son.id).map((c) => c.id)).toContain('father_debt');
    const reason = ctx.state.opinionReasons.find((r) => r.holder === friend.id && r.target === son.id)!;
    reason.end = ctx.state.day;
    expect(opinionCauses(ctx, friend.id, son.id).map((c) => c.id)).not.toContain('father_debt');
  });
});

describe('the feud (GDD §8.6)', () => {
  it('a rival who still holds a grudge becomes a rival of the heir, with the line "Heir to the feud"', () => {
    const { ctx, hero, son } = withSon();
    const rival = circleMember(ctx);
    startRelation(ctx, 'rival', hero.id, rival.id);
    addOpinionReason(ctx, rival.id, hero.id, 'insult');
    kill(ctx, hero, 'fever');
    expect(activeRelationBetween(ctx.state, son.id, rival.id, 'rival')).not.toBeNull();
    const line = ctx.state.chronicle.find((e) => e.kind === 'feud_inherited');
    expect(line).toMatchObject({ level: 'chronicle' });
    expect(entryText(line!)).toBe(`${son.givenName} ${son.surname} became heir to the feud between ${hero.givenName} ${hero.surname} and ${rival.givenName} ${rival.surname}.`);
    expect(checkInvariants(ctx.state, content)).toEqual([]);
  });

  it('with no grudge the rivalry dies with the head', () => {
    const { ctx, hero, son } = withSon();
    const rival = circleMember(ctx);
    startRelation(ctx, 'rival', hero.id, rival.id);
    kill(ctx, hero, 'fever');
    expect(activeRelationBetween(ctx.state, son.id, rival.id, 'rival')).toBeNull();
    expect(texts(ctx.state).some((t) => t.includes('heir to the feud'))).toBe(false);
  });

  it('a friendship does not pass', () => {
    const { ctx, hero, son } = withSon();
    const friend = circleMember(ctx);
    startRelation(ctx, 'friend', hero.id, friend.id);
    addOpinionReason(ctx, friend.id, hero.id, 'insult');
    kill(ctx, hero, 'fever');
    expect(activeRelationBetween(ctx.state, son.id, friend.id)).toBeNull();
  });
});

describe('knowledge of people (GDD §8.6)', () => {
  it('a child of the dead head knows their close acquaintances a step lower, and not those only known', () => {
    const { ctx, hero, son } = withSon();
    const close = circleMember(ctx);
    const known = circleMember(ctx);
    introduce(ctx, close.id, 'close');
    introduce(ctx, known.id);
    kill(ctx, hero, 'fever');
    expect(acquaintanceLevel(ctx.state, content, son.id, close.id)).toBe('known');
    expect(acquaintanceLevel(ctx.state, content, son.id, known.id)).toBeNull();
    expect(checkInvariants(ctx.state, content)).toEqual([]);
  });

  it('a brother who was in the circle on the day of death knows them too; a brother far away starts anew', () => {
    for (const near of [true, false]) {
      const { ctx, hero } = setup();
      const father = person(ctx, 70);
      hero.father = father.id;
      const brother = person(ctx, 28, { father: father.id });
      if (near) ctx.state.circle.push(brother.id);
      const close = circleMember(ctx);
      introduce(ctx, close.id, 'close');
      kill(ctx, hero, 'fever');
      expect(getPlayer(ctx.state).id).toBe(brother.id);
      expect(acquaintanceLevel(ctx.state, content, brother.id, close.id)).toBe(near ? 'known' : null);
    }
  });

  it('guard: the heir the knowledge is copied for is the heir who takes over', () => {
    const { ctx, hero, son } = withSon();
    const close = circleMember(ctx);
    introduce(ctx, close.id, 'close');
    const expected = heirOf(ctx.state, hero.id)!.heir;
    kill(ctx, hero, 'fever');
    expect(getPlayer(ctx.state).id).toBe(expected.id);
    expect(ctx.state.acquaintances.some((a) => a.holder === son.id && a.other === close.id)).toBe(true);
  });

  it('a placeholder heir who is kin to no one knows nobody', () => {
    const { ctx, hero } = setup();
    const t = { ...content, succession: { ...content.succession!, temporaryHeir: true } };
    const close = circleMember(ctx);
    introduce(ctx, close.id, 'close');
    kill({ state: ctx.state, content: t }, hero, 'fever');
    const heir = getPlayer(ctx.state);
    expect(heir.id).not.toBe(hero.id);
    expect(ctx.state.acquaintances.filter((a) => a.holder === heir.id)).toEqual([]);
  });
});

describe('the renown of a house in the background of opinions', () => {
  it('a stranger thinks better of a house with renown; a member of the house does not', () => {
    const { ctx, state, hero } = setup();
    const stranger = circleMember(ctx);
    const kinsman = circleMember(ctx);
    kinsman.house = hero.house;
    const house = state.houses.find((h) => h.id === hero.house)!;
    house.renown = 0;
    const base = [opinionValue(ctx, stranger.id, hero.id), opinionValue(ctx, kinsman.id, hero.id)];
    house.renown = 20;
    expect(opinionValue(ctx, stranger.id, hero.id) - base[0]!).toBe(9);
    expect(opinionValue(ctx, kinsman.id, hero.id)).toBe(base[1]);
    house.renown = -5;
    expect(opinionValue(ctx, stranger.id, hero.id)).toBeLessThan(base[0]!);
    expect(opinionCauses(ctx, stranger.id, hero.id).find((c) => c.id === 'background')?.value).toBeDefined();
  });

  it('a person with no house has no renown to speak of', () => {
    const { ctx, hero } = setup();
    const a = circleMember(ctx);
    const b = circleMember(ctx);
    ctx.state.houses[0]!.renown = 20;
    const before = opinionValue(ctx, a.id, b.id);
    ctx.state.houses[0]!.renown = 0;
    expect(opinionValue(ctx, a.id, b.id)).toBe(before);
    expect(hero.house).not.toBeNull();
  });
});

describe('stories and follow-ups pass to the heir', () => {
  /** A hero with a son, an accusation open as a story, then dead. */
  function accused(): ReturnType<typeof withSon> & { accuser: Character } {
    const s = withSon();
    const accuser = circleMember(s.ctx);
    s.ctx.state.circle.push(person(s.ctx, 30).id);
    expect(fireEvent(s.ctx, findEvent(content, 'accusation'), s.hero, {})).toBe('waiting');
    play(s.state, content, { type: 'choose', option: 0 });
    return { ...s, accuser: s.ctx.state.characters.find((c) => c.id === s.state.openStories[0]!.given.accuser) ?? accuser };
  }

  it('an open story goes to the heir, with the same people, and ends with the fallback at the heir', () => {
    const { ctx, state, hero, son, accuser } = accused();
    kill(ctx, hero, 'fever');
    expect(state.openStories).toMatchObject([{ id: 'feud', owner: son.id, given: { accuser: accuser.id } }]);
    expect(isStoryOpen(state, son.id, 'feud')).toBe(true);
    state.day = state.openStories[0]!.deadline;
    expect(storiesPhase.run(ctx)).toBe(false);
    expect(isStoryOpen(state, son.id, 'feud')).toBe(false);
    const line = state.chronicle.find((e) => entryText(e).includes('forgot the quarrel'));
    expect(line).toBeDefined();
    expect(entryText(line!)).toContain(son.givenName);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('a follow-up goes to the heir as the main participant', () => {
    const { ctx, state, hero, son } = withSon();
    circleMember(ctx);
    expect(fireEvent(ctx, findEvent(content, 'challenge'), hero, {})).toBe('waiting');
    play(state, content, { type: 'choose', option: 0 });
    const rival = state.followups[0]!.given.rival;
    kill(ctx, hero, 'fever');
    expect(state.followups).toMatchObject([{ eventId: 'duel', protagonist: son.id, given: { rival }, offered: null }]);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('a follow-up already carried out is not run again for the heir', () => {
    const { ctx, state, hero } = withSon();
    circleMember(ctx);
    expect(fireEvent(ctx, findEvent(content, 'challenge'), hero, {})).toBe('waiting');
    play(state, content, { type: 'choose', option: 0 });
    state.followups[0]!.offered = state.day;
    state.lastFired.duel = state.day;
    kill(ctx, hero, 'fever');
    expect(state.followups).toEqual([]);
  });

  it('closes quietly when the person of the story is gone', () => {
    const { ctx, state, hero, accuser } = accused();
    kill(ctx, accuser, 'fever');
    const before = state.chronicle.length;
    kill(ctx, hero, 'fever');
    expect(state.openStories).toEqual([]);
    expect(state.followups).toEqual([]);
    expect(state.chronicle.slice(before).some((e) => /quarrel|came to nothing/.test(entryText(e)))).toBe(false);
  });

  it('closes quietly when the heir is the very person of the story', () => {
    const { ctx, state, hero, son } = withSon();
    circleMember(ctx);
    expect(fireEvent(ctx, findEvent(content, 'accusation'), hero, {})).toBe('waiting');
    play(state, content, { type: 'choose', option: 0 });
    state.openStories[0]!.given = { accuser: son.id };
    kill(ctx, hero, 'fever');
    expect(state.openStories).toEqual([]);
  });

  it('the house ends: the stories stay with the dead head and the invariants hold', () => {
    const { ctx, state, hero } = setup();
    circleMember(ctx);
    expect(fireEvent(ctx, findEvent(content, 'accusation'), hero, {})).toBe('waiting');
    play(state, content, { type: 'choose', option: 0 });
    kill(ctx, hero, 'fever');
    expect(state.status).toBe('ended');
    expect(checkInvariants(state, content)).toEqual([]);
  });
});

describe('over long runs', () => {
  it('a hundred years with the inheritance fixture: no violations, the save round-trips', () => {
    const result = runSim(content, { seed: 4, years: 100 });
    expect(result.violations).toEqual([]);
    expect(deserialize(serialize(result.state), content)).toEqual(result.state);
  }, 60_000);
});
