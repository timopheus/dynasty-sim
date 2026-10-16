import { describe, expect, it, vi } from 'vitest';
import { allCharacters, allChronicle, anyCharacter } from '../src/core/archive/archive';
import { chronicleMarkdown, journalMarkdown } from '../src/core/chronicle/markdown';
import { eraOf } from '../src/core/era/era';
import { childrenOf, isAncestor, isCloseKin, parentsOf, siblingsOf, spousesOf } from '../src/core/family/kin';
import { proposalOptions } from '../src/core/family/proposals';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { createCharacter, kill } from '../src/core/lifecycle';
import { checkInvariants } from '../src/core/invariants';
import { computeMetrics, summarize } from '../src/core/metrics';
import { entityPage } from '../src/core/pages/entity';
import { personPage } from '../src/core/pages/person';
import { hotRefs } from '../src/core/refs';
import { startRelation } from '../src/core/relations/links';
import { relationsRefs } from '../src/core/relations/relations';
import { deserialize, serialize } from '../src/core/save/save';
import { runSim } from '../src/core/sim';
import type { Character, Ctx, GameState } from '../src/core/state';
import { chooseHeir } from '../src/core/succession/phases';
import { ageYears, fromYmd, START_YEAR, toYmd } from '../src/core/time/calendar';
import { detailedCharacters, isNear } from '../src/core/world/world';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, fixtureNarrator, loadOrThrow, realContent } from './fixtures/content';

// The law of 4.6 may find nobody; until then the placeholder heir always comes. A switch lets a test take the heir away.
const heirless = vi.hoisted(() => ({ on: false }));
vi.mock('../src/core/succession/phases', async (original) => {
  const mod = await original<typeof import('../src/core/succession/phases')>();
  return { ...mod, chooseHeir: (ctx: Ctx, deceased: Character) => (heirless.on ? null : mod.chooseHeir(ctx, deceased)) };
});

/** Contracts of the hook points of stage 4 that later tasks fill (4.1, D-310). */
const content = loadOrThrow([...BASE_FILES, ...readContentFiles('tests/fixtures/population'), ...readContentFiles('tests/fixtures/opinions')]);

function setup(seed = 3): { state: GameState; ctx: Ctx; hero: Character } {
  const state = newGame(seed, content);
  return { state, ctx: { state, content }, hero: getPlayer(state) };
}

/** An adult far from the hero, with an occupation as the world gives one. */
function adult(ctx: Ctx, surname: string, parents: { father?: string; mother?: string } = {}): Character {
  const c = createCharacter(ctx, { surname, age: { min: 30, max: 30 }, ...parents });
  c.occupation = content.population!.occupations[0]!.id;
  return c;
}

describe('the end of the house (D-315)', () => {
  it('`end` ends the house; then apply takes no command', () => {
    const { state } = setup();
    apply(state, content, { type: 'end' });
    expect(state.status).toBe('ended');
    expect(checkInvariants(state, content)).toEqual([]);
    expect(() => apply(state, content, { type: 'start', actionId: 'rest' })).toThrow(/come to an end/);
    expect(() => apply(state, content, { type: 'choose', option: 0 })).toThrow(/come to an end/);
    expect(() => apply(state, content, { type: 'end' })).toThrow(/come to an end/);
    expect(serialize(deserialize(serialize(state), content))).toBe(serialize(state));
  });

  it('`end` while an event waits drops the event', () => {
    const c2 = fixtureNarrator({ eventChancePer10k: 10000 });
    const state = newGame(1, c2);
    apply(state, c2, { type: 'start', actionId: 'wait' });
    expect(state.status).toBe('awaiting_choice');
    apply(state, c2, { type: 'end' });
    expect(state.status).toBe('ended');
    expect(state.pendingEvent).toBeNull();
    expect(state.activeAction).toBeNull();
    expect(checkInvariants(state, c2)).toEqual([]);
  });

  it('the hero dies and nobody inherits: the house ends, the dead head stays the player', () => {
    const { state, ctx, hero } = setup();
    heirless.on = true;
    try {
      kill(ctx, hero, 'natural');
    } finally {
      heirless.on = false;
    }
    expect(state.status).toBe('ended');
    expect(state.playerId).toBe(hero.id);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('the run stops on `ended` and gives the year of the end', () => {
    const years = 300;
    heirless.on = true;
    let result;
    try {
      result = runSim(content, { seed: 5, years });
    } finally {
      heirless.on = false;
    }
    const { state, violations, endYear } = result;
    expect(violations).toEqual([]);
    expect(state.status).toBe('ended');
    expect(state.day).toBeLessThan(fromYmd(START_YEAR + years, 1, 1));
    expect(endYear).toBe(toYmd(state.day).year);
    const m = computeMetrics(state);
    expect(m.house).toEqual({ ended: true, endYear });
    const other = computeMetrics(runSim(content, { seed: 5, years: 5 }).state);
    expect(other.house).toEqual({ ended: false, endYear: null });
    const s = summarize([m, other]);
    expect(s['house.endedShare']).toEqual({ min: 0.5, median: 0.5, max: 0.5 });
    expect(s['house.endYear']).toEqual({ min: endYear, median: endYear, max: endYear });
  });
});

describe('succession (D-007 until 4.6)', () => {
  it('chooseHeir gives the placeholder heir of D-007: a new adult of the same surname', () => {
    const { state, ctx, hero } = setup();
    const before = state.characters.length;
    const heir = chooseHeir(ctx, hero) as Character;
    expect(state.characters).toHaveLength(before + 1);
    expect(heir.surname).toBe(hero.surname);
    expect(ageYears(heir.birthDay, state.day)).toBe(content.settings.heirAge!.min);
    expect([heir.father, heir.mother]).toEqual([null, null]);
    expect(heir.house).toBeNull(); // the succession hook of the house gives the house, not chooseHeir (4.7)
  });

  it('the death of the hero hands the house and the money to that heir', () => {
    const { state, ctx, hero } = setup();
    hero.money = 77;
    kill(ctx, hero, 'natural');
    const heir = getPlayer(state);
    expect(heir.id).not.toBe(hero.id);
    expect(heir.money).toBe(77);
    expect(state.status).toBe('awaiting_action');
    expect(state.chronicle.at(-1)).toMatchObject({ subject: heir.id, kind: 'succession' });
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('`will` and `propose` are refused until 4.6 and 4.5, and change nothing', () => {
    const { state, hero } = setup();
    const before = serialize(state);
    expect(() => apply(state, content, { type: 'will', heir: null, guardian: null, items: [] })).toThrow(/not in the game yet/);
    expect(() => apply(state, content, { type: 'propose', suitor: hero.id, target: hero.id })).toThrow(/not in the game yet/);
    expect(serialize(state)).toBe(before);
  });
});

describe('kinship queries (family/kin.ts)', () => {
  function family(ctx: Ctx) {
    const grandpa = adult(ctx, 'Old');
    const grandma = adult(ctx, 'Old');
    const father = adult(ctx, 'Old', { father: grandpa.id, mother: grandma.id });
    const uncle = adult(ctx, 'Old', { father: grandpa.id, mother: grandma.id });
    const mother = adult(ctx, 'Other');
    const second = adult(ctx, 'Third');
    const child = adult(ctx, 'Old', { father: father.id, mother: mother.id });
    const sister = adult(ctx, 'Old', { father: father.id, mother: mother.id });
    const half = adult(ctx, 'Old', { father: father.id, mother: second.id });
    const cousin = adult(ctx, 'Old', { father: uncle.id });
    const stranger = adult(ctx, 'Far');
    return { grandpa, grandma, father, uncle, mother, second, child, sister, half, cousin, stranger };
  }

  it('reads parents, children and siblings from father and mother', () => {
    const { state, ctx } = setup();
    const f = family(ctx);
    const ids = (list: Character[]) => list.map((c) => c.id);
    expect(ids(parentsOf(state, f.child.id))).toEqual([f.father.id, f.mother.id]);
    expect(ids(parentsOf(state, f.cousin.id))).toEqual([f.uncle.id]);
    expect(ids(parentsOf(state, f.grandpa.id))).toEqual([]);
    expect(ids(childrenOf(state, f.father.id))).toEqual([f.child.id, f.sister.id, f.half.id]);
    expect(ids(siblingsOf(state, f.child.id))).toEqual([f.sister.id, f.half.id]);
    expect(ids(siblingsOf(state, f.father.id))).toEqual([f.uncle.id]);
    expect(ids(siblingsOf(state, f.stranger.id))).toEqual([]);
    expect(isAncestor(state, f.grandma.id, f.child.id)).toBe(true);
    expect(isAncestor(state, f.child.id, f.grandma.id)).toBe(false);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('close kin by D-313: ancestors, siblings and half-siblings, uncles; cousins are not', () => {
    const { state, ctx } = setup();
    const f = family(ctx);
    const close = (a: Character, b: Character) => [isCloseKin(state, a.id, b.id), isCloseKin(state, b.id, a.id)];
    expect(close(f.child, f.father)).toEqual([true, true]);
    expect(close(f.child, f.grandpa)).toEqual([true, true]);
    expect(close(f.child, f.sister)).toEqual([true, true]);
    expect(close(f.child, f.half)).toEqual([true, true]);
    expect(close(f.child, f.uncle)).toEqual([true, true]);
    expect(close(f.child, f.cousin)).toEqual([false, false]);
    expect(close(f.child, f.stranger)).toEqual([false, false]);
    expect(close(f.father, f.mother)).toEqual([false, false]);
  });

  it('reads spouses from the marriage records', () => {
    const { state, ctx } = setup();
    const f = family(ctx);
    state.marriages.push({ a: f.father.id, b: f.mother.id, start: 0, end: null, endReason: null });
    expect(spousesOf(state, f.mother.id).map((c) => c.id)).toEqual([f.father.id]);
    expect(spousesOf(state, f.second.id)).toEqual([]);
    expect(checkInvariants(state, content)).toEqual([]);
    state.marriages.push({ a: f.child.id, b: f.child.id, start: 0, end: 0, endReason: null });
    expect(checkInvariants(state, content).join('\n')).toMatch(/married to themself[\s\S]*end without a reason/);
  });
});

describe('HOT_REFS (refs.ts, D-312)', () => {
  it('names the circle, the scope of the waiting event and both sides of a relation', () => {
    const { state, ctx, hero } = setup();
    const far = adult(ctx, 'Far');
    const [x, y] = state.circle as [string, string];
    expect(state.circle.length).toBeGreaterThan(1);
    startRelation(ctx, 'rival', x, y);
    state.circle = state.circle.filter((id) => id !== y);
    state.pendingEvent = {
      eventId: 'some_event',
      protagonist: hero.id,
      scope: { hero: hero.id, protagonist: hero.id, stranger: far.id },
      seq: 1,
      page: null,
      lines: [],
      money: 0,
      mark: false,
      important: false,
      after: [],
    };
    const refs = hotRefs(ctx);
    for (const id of [hero.id, ...state.circle, far.id, x, y]) expect(refs.has(id), id).toBe(true);
    state.pendingEvent = null;
    expect(hotRefs(ctx).has(far.id)).toBe(false);
  });

  it('keeps the relations of the dead out once both sides are dead', () => {
    const { state, ctx } = setup();
    const [x, y] = state.circle as [string, string];
    startRelation(ctx, 'rival', x, y);
    expect(relationsRefs(ctx)).toEqual([x, y]);
    kill(ctx, state.characters.find((c) => c.id === x)!, 'natural');
    expect(relationsRefs(ctx)).toEqual([x, y]);
    kill(ctx, state.characters.find((c) => c.id === y)!, 'natural');
    expect(relationsRefs(ctx)).toEqual([]);
  });
});

describe('pages through the archive access (D-311, D-312)', () => {
  it('entityPage of a person is the page of the person; other ids have no page yet', () => {
    const { ctx, hero, state } = setup();
    const x = state.circle[0] as string;
    expect(entityPage(ctx, hero.id)).toEqual({ type: 'person', page: personPage(ctx, hero.id) });
    expect(entityPage(ctx, x)).toEqual({ type: 'person', page: personPage(ctx, x) });
    expect(entityPage(ctx, 'c9999')).toBeNull();
    expect(entityPage(ctx, 'h999')).toBeNull();
    // the house section of 4.7 is the only one filled so far: the house of the hero
    expect(personPage(ctx, hero.id)!.sections.map((s) => s.id)).toEqual(['house']);
  });

  it('pages, markdown and metrics read the archive and the hot part as one', () => {
    const real = realContent();
    // Under HOT_YEARS (archive/phases.ts): the archive phase has made no chunk yet.
    const { state } = runSim(real, { seed: 2, years: 9 });
    const ctx: Ctx = { state, content: real };
    expect(allChronicle(state)).toBe(state.chronicle);
    expect(allCharacters(state)).toBe(state.characters);
    const chronicle = chronicleMarkdown(state);
    const journal = journalMarkdown(state);
    const metrics = computeMetrics(state);
    const heroPage = personPage(ctx, state.playerId);
    // A chunk made by hand, as the archive phase does: old lines and long-dead people nobody hot names go into a chunk.
    const cut = Math.floor(state.chronicle.length / 2);
    const old = state.chronicle.slice(0, cut);
    state.chronicle = state.chronicle.slice(cut);
    const refs = hotRefs(ctx);
    const gone = state.characters.filter((c) => c.deathDay !== null && !refs.has(c.id));
    expect(gone.length).toBeGreaterThan(0);
    state.characters = state.characters.filter((c) => !gone.includes(c));
    state.archive.push({ day: state.day, chronicle: old, characters: gone, relations: { opinionReasons: [], relations: [], acquaintances: [], secrets: [] } });
    expect(allChronicle(state)).toHaveLength(old.length + state.chronicle.length);
    expect(anyCharacter(state, (gone[0] as Character).id)).toBe(gone[0]);
    expect(personPage(ctx, (gone[0] as Character).id)).not.toBeNull();
    expect(chronicleMarkdown(state)).toBe(chronicle);
    expect(journalMarkdown(state)).toBe(journal);
    const sizes = { saveBytes: 0, hotBytes: 0, archiveBytes: 0 };
    expect({ ...computeMetrics(state), ...sizes }).toEqual({ ...metrics, ...sizes });
    expect(personPage(ctx, state.playerId)).toEqual(heroPage);
  }, 30_000);
});

describe('the household and other contracts', () => {
  it('the household is simulated after the hero, before the circle, and is near the hero (D-313)', () => {
    const { state, ctx, hero } = setup();
    const spouse = createCharacter(ctx, { surname: 'Home', age: { min: 30, max: 30 } });
    const child = createCharacter(ctx, { surname: 'Home', age: { min: 3, max: 3 } });
    state.household.push(spouse.id, child.id);
    expect(detailedCharacters(state).map((c) => c.id)).toEqual([hero.id, spouse.id, child.id, ...state.circle]);
    expect(isNear(state, spouse.id)).toBe(true);
    expect(checkInvariants(state, content)).toEqual([]);
    state.household = [child.id];
    expect(checkInvariants(state, content)).toEqual([`${spouse.id} lives without an occupation`]);
    kill(ctx, child, 'natural');
    expect(state.household).toEqual([]);
  });

  it('proposals, eras and living people: the simplest forms', () => {
    const { state, ctx, hero } = setup();
    expect(proposalOptions(ctx, hero.id)).toEqual([]);
    expect(eraOf(ctx, state.day)).toBeNull();
    const m = computeMetrics(state);
    expect(m.livingMax).toBe(m.characters.alive);
    expect(state.livingMax).toBe(0);
  });

  it('counts the most living people once a year', () => {
    const { state } = runSim(content, { seed: 4, years: 3 });
    expect(state.summaryYear).toBeGreaterThanOrEqual(START_YEAR + 2);
    expect(state.livingMax).toBeGreaterThan(0);
    expect(computeMetrics(state).livingMax).toBeGreaterThanOrEqual(state.livingMax);
  });
});
