import { describe, expect, it } from 'vitest';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { kill } from '../src/core/lifecycle';
import { personPage } from '../src/core/pages/person';
import { introduce } from '../src/core/relations/acquaintance';
import { endRelation, startRelation } from '../src/core/relations/links';
import { addOpinionReason } from '../src/core/relations/opinions';
import { addSecret } from '../src/core/relations/secrets';
import { serialize } from '../src/core/save/save';
import type { Character, Ctx, GameState } from '../src/core/state';
import { BASE_FILES, loadOrThrow } from './fixtures/content';
import { readContentFiles } from '../tools/content-files';

const content = loadOrThrow([
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions'),
  ...readContentFiles('tests/fixtures/pages'),
]);

function setup(seed = 3): { state: GameState; ctx: Ctx; hero: Character; x: Character; y: Character } {
  const state = newGame(seed, content);
  apply(state, content, { type: 'start', actionId: 'rest' });
  state.acquaintances.length = 0;
  const [x, y] = state.circle.map((id) => state.characters.find((c) => c.id === id) as Character);
  return { state, ctx: { state, content }, hero: getPlayer(state), x: x as Character, y: y as Character };
}

describe('person page visibility (GDD 8.8)', () => {
  const secretTrait = content.traits.find((t) => t.visibility === 'secret');
  const normalTrait = content.traits.find((t) => t.visibility === 'normal');
  const obviousTrait = content.traits.find((t) => t.visibility === 'obvious');

  it('has the traits of each visibility in the fixture', () => {
    expect(secretTrait && normalTrait && obviousTrait).toBeTruthy();
  });

  it('shows a stranger only the obvious: no secret or ordinary trait, no stats, no opinion', () => {
    const { ctx, x } = setup();
    x.traits = [secretTrait!.id, normalTrait!.id, obviousTrait!.id];
    x.fame = 0;
    const page = personPage(ctx, x.id)!;
    expect(page.level).toBe('stranger');
    expect(page.traits).toEqual([obviousTrait!.name]);
    expect(page.stats).toBeNull();
    expect(page.opinion).toBeNull();
    expect(page.occupation).toBeNull();
    expect(page.money).toBeNull();
    expect(page.life).toMatch(/^(about \d+|a small child)$/);
    expect(JSON.stringify(page)).not.toContain(secretTrait!.name);
  });

  it('fame opens more to a stranger step by step', () => {
    const { ctx, x } = setup();
    x.traits = [normalTrait!.id];
    x.occupation = content.population!.occupations[0]!.id;
    x.fame = 1;
    let page = personPage(ctx, x.id)!;
    expect(page.occupation).not.toBeNull();
    expect(page.life).toMatch(/^b\. \d+$/);
    expect(page.traits).toEqual([]);
    x.fame = 2;
    page = personPage(ctx, x.id)!;
    expect(page.traits).toEqual([normalTrait!.name]);
    expect(page.level).toBe('stranger');
    expect(page.stats).toBeNull();
  });

  it('acquaintance opens character, stats in words and the opinion in words, but never a secret trait', () => {
    const { ctx, x, hero } = setup();
    x.traits = [secretTrait!.id, normalTrait!.id];
    x.fame = 0;
    addOpinionReason(ctx, x.id, hero.id, 'insult');
    introduce(ctx, x.id, 'known');
    const page = personPage(ctx, x.id)!;
    expect(page.level).toBe('known');
    expect(page.traits).toEqual([normalTrait!.name]);
    expect(page.stats).toHaveLength(6);
    expect(page.stats!.every((s) => s.value === null)).toBe(true);
    expect(page.opinion).toMatchObject({ word: 'hatred', value: null, lines: [] });
  });

  it('close acquaintance gives the reasons with dates and numbers', () => {
    const { ctx, x, hero } = setup();
    x.traits = [];
    hero.traits = [];
    addOpinionReason(ctx, x.id, hero.id, 'insult');
    introduce(ctx, x.id, 'close');
    const page = personPage(ctx, x.id)!;
    expect(page.level).toBe('close');
    expect(page.stats!.every((s) => typeof s.value === 'number')).toBe(true);
    expect(page.opinion!.value).toBe(-60);
    expect(page.opinion!.lines).toEqual([{ text: 'Insult', year: 1700, value: -60, lasting: true }]);
  });

  it('shows the hero in full, secret traits and money included', () => {
    const { ctx, hero } = setup();
    hero.traits = [secretTrait!.id];
    const page = personPage(ctx, hero.id)!;
    expect(page.level).toBe('self');
    expect(page.traits).toEqual([secretTrait!.name]);
    expect(page.money).toBe(hero.money);
    expect(page.opinion).toBeNull();
  });

  it('shows a secret kind only once the hero knows it', () => {
    const { ctx, x, hero } = setup();
    const secret = addSecret(ctx, x.id, 'secret_killing', [x.id]);
    expect(personPage(ctx, x.id)!.secrets).toEqual([]);
    secret.knownBy.push(hero.id);
    expect(personPage(ctx, x.id)!.secrets).toEqual(['secret killing']);
  });

  it('lists allies and rivals, ended ones too, and marks the dead', () => {
    const { ctx, state, x, y } = setup();
    introduce(ctx, x.id, 'known');
    const rival = startRelation(ctx, 'rival', x.id, y.id);
    const friend = startRelation(ctx, 'friend', x.id, getPlayer(state).id);
    let page = personPage(ctx, x.id)!;
    expect(page.rivals.map((r) => r.person.id)).toEqual([y.id]);
    expect(page.allies.map((r) => r.person.id)).toEqual([getPlayer(state).id]);
    endRelation(ctx, friend, 'quarrel');
    kill(ctx, y, 'illness');
    page = personPage(ctx, x.id)!;
    expect(page.rivals[0]!.person.dead).toBe(true);
    expect(page.allies[0]!.endYear).toBe(1700);
    expect(rival.end).not.toBeNull();
    // strangers show no relations
    expect(personPage(ctx, y.id)!.rivals).toEqual([]);
  });

  it('gives the cause of death to acquaintances and the very famous only', () => {
    const { ctx, x, y } = setup();
    x.traits = [];
    kill(ctx, x, 'illness');
    expect(personPage(ctx, x.id)!.death).toMatchObject({ cause: null });
    x.fame = 3;
    expect(personPage(ctx, x.id)!.death!.cause).toMatch(/\S/);
    y.fame = 0;
    introduce(ctx, y.id, 'known');
    kill(ctx, y, 'illness');
    expect(personPage(ctx, y.id)!.death!.cause).toMatch(/\S/);
  });

  it('reads the state and changes nothing', () => {
    const { ctx, state, x, hero } = setup();
    introduce(ctx, x.id, 'close');
    addOpinionReason(ctx, x.id, hero.id, 'gift');
    const before = serialize(state);
    for (const c of state.characters) personPage(ctx, c.id);
    expect(serialize(state)).toBe(before);
    expect(personPage(ctx, 'c999999')).toBeNull();
  });

  it('keeps the chronicle of a head apart from the journal and counts the dead at the age of death', () => {
    const { ctx, state, hero } = setup();
    for (let i = 0; i < 40; i++) state.chronicle.push({ day: state.day, subject: hero.id, kind: 'event', level: 'journal', parts: ['noise'] });
    const page = personPage(ctx, hero.id)!;
    expect(page.journal).toHaveLength(30);
    expect(page.chronicle.every((e) => e.level === 'chronicle')).toBe(true);
    expect(page.chronicle.some((e) => e.kind === 'start')).toBe(true);
    // a stranger gets no journal
    const other = state.characters.find((c) => c.id !== hero.id)!;
    expect(personPage(ctx, other.id)!.journal).toEqual([]);
    // the dead stay as they were
    other.birthDay = hero.birthDay;
    introduce(ctx, other.id, 'known');
    kill(ctx, other, 'illness');
    const atDeath = personPage(ctx, other.id)!.stats;
    state.day += 365 * 80;
    expect(personPage(ctx, other.id)!.stats).toEqual(atDeath);
  });
});
