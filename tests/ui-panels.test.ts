import { describe, expect, it } from 'vitest';
import type { Content } from '../src/core/content/schema';
import { findEvent, fireEvent } from '../src/core/events/events';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/lifecycle';
import type { Ctx } from '../src/core/state';
import { eventScreen, eventTitle } from '../src/ui/event';
import { headerFigures } from '../src/ui/header-model';
import { beforeChoice, outcomeOf } from '../src/ui/outcome-model';
import { sidebarPage, visit } from '../src/ui/sidebar-model';
import { whereView } from '../src/ui/where-model';
import { entityHref, entityIdFromHash } from '../src/ui/address';
import { BASE_FILES, loadOrThrow, realContent } from './fixtures/content';
import { readContentFiles } from '../tools/content-files';

const eventContent: Content = loadOrThrow([
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions'),
  ...readContentFiles('tests/fixtures/events'),
]);

function eventGame() {
  const state = newGame(1, eventContent);
  const ctx: Ctx = { state, content: eventContent };
  const hero = getPlayer(state);
  hero.baseStats = { diplomacy: 5, martial: 5, stewardship: 5, intrigue: 5, learning: 5, prowess: 5 };
  hero.traits = [];
  const friend = createCharacter(ctx, { surname: 'Circle', age: { min: 30, max: 30 } });
  friend.occupation = 'porter';
  state.circle.push(friend.id);
  return { ctx, hero };
}

describe('header', () => {
  it('shows the shared figures, numbers in brackets', () => {
    const content = realContent();
    const state = newGame(5, content);
    const figures = headerFigures(state, content);
    expect(figures.map((f) => f.label)).toEqual(['money', 'fame', 'house renown', 'house status']);
    expect(figures[0]?.value).toBe(`${getPlayer(state).money} crowns`);
    expect(figures[1]?.value).toMatch(/\(\d+\)$/);
    expect(figures[2]?.value).toMatch(/\(\d+\)$/);
  });

  it('shows the monthly balance under the money, with its lines, as text', () => {
    const content = realContent();
    const state = newGame(5, content);
    state.activeAction = { actionId: 'serve_contract', endDay: state.day + 100 };
    const money = headerFigures(state, content)[0];
    expect(money?.note).toMatch(/^[+−]\d+ \/ month$/);
    expect(money?.breakdown?.[0]).toMatch(/^Work \+\d+$/);
    expect(money?.breakdown?.some((l) => l.startsWith('Living costs −'))).toBe(true);
  });
});

describe('where I am', () => {
  it('names the action and the days left, never a day of a total', () => {
    const content = realContent();
    const state = newGame(5, content);
    const ctx: Ctx = { state, content };
    state.backstory.running = false;
    state.pendingEvent = null;
    state.status = 'awaiting_action';
    expect(whereView(ctx)).toMatchObject({ heading: 'Free to act', ended: false });
    expect(whereView(ctx).actions.length).toBeGreaterThan(0);
    const action = content.actions[0]!;
    state.activeAction = { actionId: action.id, endDay: state.day + 8 };
    expect(whereView(ctx)).toEqual({ heading: action.name, line: '8 days left', actions: [], ended: false });
    state.activeAction = { actionId: action.id, endDay: state.day + 1 };
    expect(whereView(ctx).line).toBe('1 day left');
  });

  it('offers no actions to a hero still growing up, and says the house is over when it is', () => {
    const content = realContent();
    const state = newGame(5, content);
    const ctx: Ctx = { state, content };
    expect(state.backstory.running).toBe(true);
    expect(whereView(ctx)).toMatchObject({ heading: 'Growing up', actions: [] });
    state.status = 'ended';
    expect(whereView(ctx)).toMatchObject({ ended: true, actions: [] });
  });
});

describe('event window title', () => {
  it('shows the age of the stage of a backstory scene, and no year', () => {
    const content = realContent();
    const state = newGame(5, content);
    const ctx: Ctx = { state, content };
    const screen = eventScreen(ctx)!;
    const age = content.backstory?.stages[state.backstory.stage]?.age;
    expect(eventTitle(ctx, screen)).toBe(age === undefined ? 'Growing up' : `Age ${String(age)}`);
    expect(eventTitle(ctx, screen)).not.toMatch(/\d{4}/);
  });

  it('calls a notice news and an event with answers a decision', () => {
    const { ctx, hero } = eventGame();
    fireEvent(ctx, findEvent(eventContent, 'loud_notice'), hero);
    expect(eventTitle(ctx, eventScreen(ctx)!)).toBe('News');
    apply(ctx.state, eventContent, { type: 'choose', option: 0 });
    fireEvent(ctx, findEvent(eventContent, 'choices'), hero);
    expect(eventTitle(ctx, eventScreen(ctx)!)).toBe('A decision');
  });
});

describe('outcome of a choice', () => {
  it('shows the lines of the day and the change of the hero for a choice with a stake', () => {
    const { ctx, hero } = eventGame();
    hero.money = 100;
    fireEvent(ctx, findEvent(eventContent, 'choices'), hero);
    const before = beforeChoice(ctx, true);
    apply(ctx.state, eventContent, { type: 'choose', option: 2 });
    const outcome = outcomeOf(ctx, before)!;
    expect(outcome).not.toBeNull();
    expect(outcome.died).toBeNull();
    expect(outcome.lines.length).toBeGreaterThan(0);
    for (const l of outcome.lines) expect(l.day).toBe(before.hero.day);
  });

  it('has no window for a plain choice that changes nothing and writes nothing', () => {
    const { ctx, hero } = eventGame();
    fireEvent(ctx, findEvent(eventContent, 'loud_notice'), hero);
    const before = beforeChoice(ctx, false);
    apply(ctx.state, eventContent, { type: 'choose', option: 0 });
    const money = hero.money;
    const outcome = outcomeOf(ctx, before);
    // a quiet notice pays 1 crown: that is a change, so it has a window; the same notice without the pay does not
    expect(outcome?.changes.map((c) => c.label)).toEqual(['Money']);
    expect(money).toBeGreaterThan(0);
    const again = beforeChoice(ctx, false);
    expect(outcomeOf(ctx, again)).toBeNull();
  });

  it('is not shown between two pages of one event', () => {
    const { ctx, hero } = eventGame();
    fireEvent(ctx, findEvent(eventContent, 'two_pages'), hero);
    const before = beforeChoice(ctx, false);
    apply(ctx.state, eventContent, { type: 'choose', option: 0 });
    expect(ctx.state.pendingEvent?.page).toBe('talk');
    expect(outcomeOf(ctx, before)).toBeNull();
  });

  it('keeps the difference of the hero out when the date moved', () => {
    const { ctx, hero } = eventGame();
    fireEvent(ctx, findEvent(eventContent, 'loud_notice'), hero);
    const before = beforeChoice(ctx, true);
    apply(ctx.state, eventContent, { type: 'choose', option: 0 });
    ctx.state.day += 3;
    expect(outcomeOf(ctx, before)?.changes).toEqual([]);
  });

  it('does not put a later death on the choice', () => {
    const { ctx, hero } = eventGame();
    fireEvent(ctx, findEvent(eventContent, 'loud_notice'), hero);
    const before = beforeChoice(ctx, false);
    apply(ctx.state, eventContent, { type: 'choose', option: 0 });
    ctx.state.day += 3;
    hero.deathDay = ctx.state.day;
    expect(outcomeOf(ctx, before)?.died ?? null).toBeNull();
  });

  it('shows a death and the new head instead of a difference of two people', () => {
    const { ctx, hero } = eventGame();
    fireEvent(ctx, findEvent(eventContent, 'loud_notice'), hero);
    const before = beforeChoice(ctx, true);
    apply(ctx.state, eventContent, { type: 'choose', option: 0 });
    hero.deathDay = ctx.state.day;
    const outcome = outcomeOf(ctx, before)!;
    expect(outcome.died).toMatchObject({ name: expect.stringContaining(hero.surname) });
    expect(outcome.changes).toEqual([]);
  });
});

describe('side panel pages', () => {
  const content = realContent();
  const state = newGame(5, content);
  const ctx: Ctx = { state, content };
  const hero = getPlayer(state);

  it('gives a person four tabs with the profile first, numbers in brackets', () => {
    const page = sidebarPage(ctx, hero.id);
    expect(page.kind).toBe('Person');
    expect(page.tabs.map((t) => t.label)).toEqual(['Profile', 'Family', 'People', 'Chronicle']);
    const profile = page.tabs[0]!.blocks[0];
    expect(profile).toMatchObject({ type: 'facts' });
    const rows = profile?.type === 'facts' ? profile.rows : [];
    expect(rows.map((r) => r.label)).toEqual(expect.arrayContaining(['Age', 'Health', 'Diplomacy', 'Heir']));
    expect(rows.find((r) => r.label === 'Diplomacy')?.parts[0]).toMatch(/\(\d+\)$/);
  });

  it('shows a stranger by words only', () => {
    const stranger = createCharacter(ctx, { surname: 'Faraway', age: { min: 30, max: 30 } });
    const rows = sidebarPage(ctx, stranger.id).tabs[0]!.blocks.flatMap((b) => (b.type === 'facts' ? b.rows : []));
    for (const r of rows.filter((x) => x.label === 'Diplomacy')) expect(r.parts[0]).not.toMatch(/\(\d+\)/);
  });

  it('gives a house Overview, Heads, Heirlooms and Chronicle, and the heads come from the house', () => {
    const houseId = hero.house!;
    const page = sidebarPage(ctx, houseId);
    expect(page.kind).toBe('House');
    expect(page.tabs.map((t) => t.label)).toEqual(['Overview', 'Heads', 'Heirlooms', 'Chronicle']);
    const heads = page.tabs[1]!.blocks[0]!;
    expect(heads).toMatchObject({ type: 'facts' });
    expect(heads.type === 'facts' ? heads.rows.map((r) => r.parts[0]) : []).toContainEqual({ id: hero.id, name: expect.stringContaining(hero.surname) });
    const overview = page.tabs[0]!.blocks[0]!;
    expect(overview.type === 'facts' ? overview.rows.map((r) => r.label) : []).toEqual(expect.arrayContaining(['Status', 'Renown']));
  });

  it('says so for an address with nothing behind it', () => {
    expect(sidebarPage(ctx, 'c99999').title).toBe('Nobody by that name');
  });

  it('keeps a trail of pages: new pages add, an earlier page cuts back to it', () => {
    expect(visit([], 'c1')).toEqual(['c1']);
    expect(visit(['c1'], 'h1')).toEqual(['c1', 'h1']);
    expect(visit(['c1', 'h1', 'c2'], 'h1')).toEqual(['c1', 'h1']);
    expect(visit(['c1', 'h1'], 'h1')).toEqual(['c1', 'h1']);
    expect(entityIdFromHash(entityHref('house', 'h1'))).toBe('h1');
  });
});
