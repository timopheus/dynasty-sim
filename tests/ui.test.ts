import { describe, expect, it, vi } from 'vitest';
import { entryText } from '../src/core/chronicle/log';
import { chronicleMarkdown, journalMarkdown } from '../src/core/chronicle/markdown';
import type { Content } from '../src/core/content/schema';
import { findEvent, fireEvent } from '../src/core/events/events';
import { getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/lifecycle';
import type { Ctx } from '../src/core/state';
import { CHANCE_WORDS, actionRows, eventScreen } from '../src/ui/event';
import { entryView, headIds } from '../src/ui/entry';
import { readContentFiles } from '../tools/content-files';
import { play, newGame } from '../src/core/game';
import { deserialize, serialize } from '../src/core/save/save';
import { newJournal } from '../src/core/save/journal';
import { heroView } from '../src/ui/hero';
import { entityHref, entityIdFromHash, personHref, personIdFromHash } from '../src/ui/address';
import { isValidSeed } from '../src/core/rng';
import { seedFromSearch, startChoice } from '../src/ui/storage';
import { BASE_FILES, fixtureContent, loadOrThrow, realContent } from './fixtures/content';

// A condition the hero cannot know about: no such key exists yet, so the test adds one (as in events.test.ts).
vi.mock('../src/core/roles/conditions', async (original) => {
  const actual = await original<typeof import('../src/core/roles/conditions')>();
  return {
    ...actual,
    checkRolesConditions: (...args: Parameters<typeof actual.checkRolesConditions>) =>
      (args[2] as { secret_test?: boolean }).secret_test ? [{ text: 'Knows a secret', hidden: true }] : actual.checkRolesConditions(...args),
  };
});

describe('hero view', () => {
  it('shows stats as words with numbers kept for hover, and traits apart from education', () => {
    const content = realContent();
    const state = newGame(5, content);
    const view = heroView(state, content);
    expect(view.stats).toHaveLength(6);
    for (const s of view.stats) {
      expect(s.word).not.toBe('');
      expect(Number.isInteger(s.value)).toBe(true);
    }
    expect(view.age).toBeGreaterThanOrEqual(16);
    expect(view.name).toContain(view.surname);
    expect(view.conditions).toBe('');
  });
});

describe('start choice', () => {
  const content = fixtureContent();
  const saved = { kind: 'loaded' as const, state: newGame(7, content), journal: newJournal(7, ''), saved: { game: 'g', chunks: 0, commands: 0 } };

  it('reads the seed from the address only when it is there and valid', () => {
    for (const search of ['', '?', '?seed=', '?foo=1', '?seed=abc', '?seed=-1']) expect(seedFromSearch(search, isValidSeed)).toBeNull();
    expect(seedFromSearch('?seed=0', isValidSeed)).toBe(0);
    expect(seedFromSearch('?seed=7', isValidSeed)).toBe(7);
  });

  it('continues the saved game unless the address asks for another seed', () => {
    expect(startChoice(saved, null)).toBe('continue');
    expect(startChoice(saved, 7)).toBe('continue');
    expect(startChoice(saved, 8)).toBe('ask_replace');
    expect(startChoice({ kind: 'none' }, null)).toBe('new');
    expect(startChoice({ kind: 'discarded', reason: 'corrupt', message: '', journal: null }, 8)).toBe('new');
  });
});

describe('person page addresses', () => {
  it('round-trips an id through the address and rejects anything else', () => {
    expect(personIdFromHash(personHref('c12'))).toBe('c12');
    for (const bad of ['', '#', '#/person/', '#/person/c1/x', '#/person/<script>', '#person/c1']) expect(personIdFromHash(bad)).toBeNull();
  });

  it('reads an entity id under any word of the kind; the old person address still works (D-311)', () => {
    expect(entityHref('house', 'h40')).toBe('#/house/h40');
    expect(entityIdFromHash(entityHref('house', 'h40'))).toBe('h40');
    expect(entityIdFromHash(personHref('c12'))).toBe('c12');
    for (const bad of ['', '#', '#/house/', '#/house/h1/x', '#/House/h1', '#/house/<script>', '#house/h1']) expect(entityIdFromHash(bad)).toBeNull();
  });
});

const eventContent: Content = loadOrThrow([
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions'),
  ...readContentFiles('tests/fixtures/events'),
]);

function eventGame(c: Content = eventContent) {
  const state = newGame(1, c);
  const ctx: Ctx = { state, content: c };
  const hero = getPlayer(state);
  hero.baseStats = { diplomacy: 5, martial: 5, stewardship: 5, intrigue: 5, learning: 5, prowess: 5 };
  hero.traits = [];
  const friend = createCharacter(ctx, { surname: 'Circle', age: { min: 30, max: 30 } });
  friend.occupation = 'porter';
  state.circle.push(friend.id);
  return { ctx, hero, friend };
}

describe('event screen', () => {
  it('shows names as links, a grey option with its reason, and the chance in words with the percent on hover', () => {
    const { ctx, hero } = eventGame();
    fireEvent(ctx, findEvent(eventContent, 'choices'), hero);
    const screen = eventScreen(ctx)!;
    expect(screen.text).toEqual(['A choice for ', { id: hero.id, name: `${hero.givenName} ${hero.surname}` }, '.']);
    expect(screen.options.map((o) => o.grey)).toEqual([false, true, false]);
    expect(screen.options[1]).toMatchObject({ reason: 'Requires 1000 crowns', chance: null });
    expect(screen.options[2]!.chance).toEqual({ word: CHANCE_WORDS.risky, percent: 25, title: '25%' });
  });

  it('leaves out an option whose reason the hero must not know', () => {
    const { ctx, hero } = eventGame();
    const base = findEvent(eventContent, 'choices');
    const secret = { ...base, id: 'secret', options: [...base.options!, { text: 'Use what you know', when: { secret_test: true } as never, result: '{name} used a secret.' }] };
    const c = { ...eventContent, events: [...eventContent.events, secret] };
    const cctx = { state: ctx.state, content: c };
    fireEvent(cctx, secret, hero);
    expect(eventScreen(cctx)!.options.map((o) => o.index)).toEqual([0, 1, 2]);
  });

  it('words every band', () => {
    expect(CHANCE_WORDS).toEqual({ hopeless: 'almost hopeless', risky: 'risky', even: 'a toss-up', likely: 'likely', certain: 'almost certain' });
  });

  it('shows a notice with a single Continue, and a second page after choosing; a saved game returns to the same page', () => {
    const { ctx, hero } = eventGame();
    fireEvent(ctx, findEvent(eventContent, 'loud_notice'), hero);
    expect(eventScreen(ctx)!.options).toEqual([{ index: 0, label: ['Continue'], grey: false, reason: '', chance: null, icons: { check: false, cost: false, trait: false }, tip: null }]);
    play(ctx.state, eventContent, { type: 'choose', option: 0 });
    expect(eventScreen(ctx)).toBeNull();

    fireEvent(ctx, findEvent(eventContent, 'two_pages'), hero);
    play(ctx.state, eventContent, { type: 'choose', option: 0 });
    const reloaded: Ctx = { state: deserialize(serialize(ctx.state), eventContent), content: eventContent };
    expect(ctx.state.pendingEvent!.page).toBe('talk');
    expect(eventScreen(reloaded)).toEqual(eventScreen(ctx));
    expect(eventScreen(ctx)!.options.map((o) => o.label.join(''))).toEqual(['Listen', 'Leave']);
  });
});

describe('action rows', () => {
  it('greys an unmet action with its reason and drops one with a hidden reason', () => {
    const c = fixtureContent();
    const ctx = { state: newGame(2, c), content: c };
    const all = c.actions.length;
    expect(actionRows(ctx)).toHaveLength(all);
    const hidden = { ...c, actions: [...c.actions, { ...c.actions[0]!, id: 'secret_deed', name: 'Secret deed', when: { secret_test: true } as never }, { ...c.actions[0]!, id: 'rich_deed', name: 'Rich deed', when: { money_min: 100000 } }] };
    const rows = actionRows({ state: ctx.state, content: hidden });
    expect(rows.map((r) => r.id)).not.toContain('secret_deed');
    expect(rows.find((r) => r.id === 'rich_deed')).toMatchObject({ grey: true, reason: expect.stringContaining('100000') });
  });
});

describe('chronicle lines', () => {
  it('marks ▸ and ◆, and cuts the subject from a line on its own page', () => {
    const { ctx, hero, friend } = eventGame();
    const name = `${hero.givenName} ${hero.surname}`;
    const own = { day: 5, subject: hero.id, kind: 'event', level: 'chronicle' as const, parts: [{ id: hero.id, name }, ' bought a horse.'], mark: true as const };
    const other = { day: 6, subject: friend.id, kind: 'death', level: 'chronicle' as const, parts: [{ id: friend.id, name: 'Circle' }, ' died.'] };
    ctx.state.chronicle.push(own, other);
    const heads = headIds(ctx.state.chronicle);
    expect(entryView(own, hero.id, heads)).toEqual({ parts: ['Bought a horse.'], mark: true, world: false });
    expect(entryView(own, null, heads).parts).toEqual(own.parts);
    expect(entryView(other, hero.id, heads)).toMatchObject({ parts: other.parts, mark: false, world: true });
    const md = chronicleMarkdown(ctx.state);
    expect(md).toContain('— Bought a horse. ▸');
    expect(journalMarkdown(ctx.state)).toContain(`${name} bought a horse.`);
    expect(md).not.toContain(`${name} bought`);
    expect(entryText(other)).toBe('Circle died.');
  });
});
