import { describe, expect, it } from 'vitest';
import { chronicleProblems } from '../src/core/chronicle/log';
import { chronicleMarkdown } from '../src/core/chronicle/markdown';
import { ENTITY_KINDS, entityExists, kindOf, makeEntityRegistry, wordOf, type EntityKind } from '../src/core/entities/registry';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { entityPage, type EntityPage } from '../src/core/pages/entity';
import { personPage } from '../src/core/pages/person';
import { serialize } from '../src/core/save/save';
import type { Ctx } from '../src/core/state';
import { BASE_FILES, loadOrThrow } from './fixtures/content';
import { hrefOf } from '../src/ui/address';

const content = loadOrThrow(BASE_FILES);

// A sample kind of the test: places `p…` do not exist yet (D-311 reserves the letter), so the sample takes `z`.
function sampleKind(known: string[]): EntityKind {
  const page = (_ctx: Ctx, id: string): EntityPage | null =>
    known.includes(id) ? { id, kind: 'sample', title: `Sample ${id}`, subtitle: 'A sample', facts: [{ label: 'Owner', parts: ['by ', { id: 'c1', name: 'Someone' }] }], chronicle: [] } : null;
  return { prefix: 'z', word: 'sample', page };
}

function setup() {
  const state = newGame(5, content);
  apply(state, content, { type: 'start', actionId: 'rest' });
  return { state, ctx: { state, content } as Ctx, hero: getPlayer(state) };
}

describe('registry of kinds (D-311)', () => {
  it('gives the kind from the prefix of the id and the word of the address', () => {
    expect(kindOf('c12')?.word).toBe('person');
    expect(kindOf('h3')?.word).toBe('house');
    expect(kindOf('i7')?.word).toBe('heirloom');
    expect(kindOf('x1')).toBeNull();
    expect(kindOf('garbage')).toBeNull();
    expect(wordOf('h3')).toBe('house');
    expect(hrefOf('h3')).toBe('#/house/h3');
    expect(hrefOf('c3')).toBe('#/person/c3');
  });

  it('refuses a repeated prefix or word, and a reserved or malformed prefix', () => {
    const a: EntityKind = { prefix: 'z', word: 'a' };
    expect(() => makeEntityRegistry([a, { prefix: 'z', word: 'b' }])).toThrow(/used twice/);
    expect(() => makeEntityRegistry([a, { prefix: 'y', word: 'a' }])).toThrow(/used twice/);
    expect(() => makeEntityRegistry([{ prefix: 'r', word: 'relation' }])).toThrow(/reserved/);
    expect(() => makeEntityRegistry([{ prefix: 'zz', word: 'a' }])).toThrow(/one lowercase letter/);
    expect(makeEntityRegistry(ENTITY_KINDS)).toBe(ENTITY_KINDS);
  });
});

describe('links in the chronicle point to entities of any kind', () => {
  it('passes a link to an existing sample entity and flags an unknown id', () => {
    const { ctx, hero } = setup();
    const kinds = makeEntityRegistry([...ENTITY_KINDS, sampleKind(['z1'])]);
    ctx.state.chronicle.push({ day: ctx.state.day, subject: hero.id, kind: 'event', level: 'journal', parts: ['Saw ', { id: 'z1', name: 'the sample' }] });
    expect(chronicleProblems(ctx, kinds)).toEqual([]);
    expect(entityExists(ctx, 'z1', kinds)).toBe(true);
    ctx.state.chronicle.push({ day: ctx.state.day, subject: hero.id, kind: 'event', level: 'journal', parts: [{ id: 'z2', name: 'nothing' }] });
    expect(chronicleProblems(ctx, kinds)).toEqual(['chronicle links to unknown entity z2']);
    // the real registry has no kind `z`, houses and heirlooms do not exist yet
    expect(chronicleProblems(ctx).length).toBe(2);
    ctx.state.chronicle.pop();
    ctx.state.chronicle.pop();
    ctx.state.chronicle.push({ day: ctx.state.day, subject: hero.id, kind: 'event', level: 'journal', parts: [{ id: 'h1', name: 'House' }] });
    expect(checkInvariants(ctx.state, ctx.content).join('\n')).toMatch(/unknown entity h1/);
  });
});

describe('common page of an entity', () => {
  it('is built from the kind, does not change the state and ignores unknown ids', () => {
    const { ctx, hero } = setup();
    const kinds = makeEntityRegistry([...ENTITY_KINDS, sampleKind(['z1'])]);
    const before = serialize(ctx.state);
    const found = entityPage(ctx, 'z1', kinds);
    expect(found).toEqual({ type: 'entity', page: expect.objectContaining({ id: 'z1', title: 'Sample z1' }) });
    expect(entityPage(ctx, 'z2', kinds)).toBeNull();
    expect(entityPage(ctx, 'q1', kinds)).toBeNull();
    expect(entityPage(ctx, hero.id, kinds)).toEqual({ type: 'person', page: personPage(ctx, hero.id) });
    expect(serialize(ctx.state)).toBe(before);
  });

  it('house and heirloom pages are wired to their prefixes and stay empty until 4.7 and 4.9', () => {
    const { ctx } = setup();
    expect(entityPage(ctx, 'h1')).toBeNull();
    expect(entityPage(ctx, 'i1')).toBeNull();
  });
});

describe('markdown', () => {
  it('writes a link to a non-person as plain text', () => {
    const { state, hero } = setup();
    state.chronicle.push({ day: state.day, subject: hero.id, kind: 'event', level: 'chronicle', parts: ['Won ', { id: 'i1', name: 'the Sword' }] });
    expect(chronicleMarkdown(state)).toContain('Won the Sword');
  });
});
