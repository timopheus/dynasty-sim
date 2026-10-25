import { describe, expect, it } from 'vitest';
import { getPlayer } from '../src/core/helpers';
import { newGame } from '../src/core/game';
import type { Ctx } from '../src/core/state';
import { actionShelves, outgrown, SHELVES, WILL_ID } from '../src/ui/actions-model';
import { kinship, personMenu, personTip } from '../src/ui/people-model';
import { willForm } from '../src/ui/will';
import { realContent } from './fixtures/content';

const content = realContent();

/** A hero of the given age who is free to act. */
function free(age: number): Ctx {
  const state = newGame(5, content);
  const ctx: Ctx = { state, content };
  state.backstory.running = false;
  state.pendingEvent = null;
  state.status = 'awaiting_action';
  getPlayer(state).birthDay = state.day - age * 365 - 100;
  return ctx;
}

const names = (ctx: Ctx) => actionShelves(ctx, willForm(ctx.state, ctx.content)).shelves.flatMap((s) => s.buttons.map((b) => b.name));

describe('the actions panel (D-443)', () => {
  it('puts every action of the content on a shelf, in the order of the shelves', () => {
    for (const a of content.actions) expect(SHELVES.map((s) => s.category), a.id).toContain(a.category);
    const panel = actionShelves(free(30), willForm(free(30).state, content));
    expect(panel.shelves.map((s) => s.title)).toEqual(['Livelihood', 'Road & place', 'Family & house', 'Self']);
    expect(panel.shelves[0]?.buttons.map((b) => b.id)).toContain('hunt');
  });

  it('greys the will while the hero is at the notary (D-453)', () => {
    const ctx = free(30);
    getPlayer(ctx.state).money = 1000;
    ctx.state.activeAction = { actionId: content.succession?.willAction ?? 'notary', endDay: ctx.state.day + 5, target: null };
    ctx.state.status = 'running';
    const will = actionShelves(ctx, willForm(ctx.state, content)).shelves.flatMap((s) => s.buttons).find((b) => b.id === WILL_ID);
    expect(will).toMatchObject({ grey: true, reason: 'you are at the notary now' });
  });

  it('puts the will on the shelf Family & house, as a button of the interface', () => {
    const ctx = free(30);
    const family = actionShelves(ctx, willForm(ctx.state, content)).shelves.find((s) => s.category === 'family');
    expect(family?.buttons.map((b) => b.id)).toContain(WILL_ID);
    expect(family?.buttons.map((b) => b.id)).not.toContain('notary');
  });

  it('keeps the information inside the button: days, and the reason when grey; no digit before the name', () => {
    const ctx = free(30);
    const buttons = actionShelves(ctx, null).shelves.flatMap((s) => s.buttons);
    const hunt = buttons.find((b) => b.id === 'hunt');
    expect(hunt?.info[0]).toBe('3–14 days');
    for (const b of buttons) expect(b.name).not.toMatch(/^\d/);
    const winter = buttons.find((b) => b.id === 'winter_quarters');
    if (winter?.grey) expect(winter.reason).not.toBe('');
  });

  it('hides what a grown hero has outgrown and shows a child the grown-up actions grey', () => {
    const adult = free(30);
    const outgrownIds = content.actions.filter((a) => outgrown(adult, a)).map((a) => a.id);
    expect(outgrownIds).toEqual(expect.arrayContaining(['grow_up', 'lessons']));
    expect(names(adult)).not.toContain('Grow up under guardianship');
    const child = free(9);
    const buttons = actionShelves(child, null).shelves.flatMap((s) => s.buttons);
    const hunt = buttons.find((b) => b.id === 'hunt');
    expect(hunt?.grey).toBe(true);
    expect(hunt?.reason).not.toBe('');
    expect(buttons.find((b) => b.id === 'lessons')?.grey).toBe(false);
  });

  it('offers the other actions while one is under way (S.6), and shows the one under way grey', () => {
    const ctx = free(30);
    ctx.state.activeAction = { actionId: 'hunt', endDay: ctx.state.day + 5, target: null };
    ctx.state.status = 'running';
    const buttons = actionShelves(ctx, null).shelves.flatMap((s) => s.buttons);
    expect(buttons.find((b) => b.id === 'hunt')).toMatchObject({ grey: true, reason: 'you are doing this now' });
    expect(buttons.find((b) => b.id === 'rest')?.grey).toBe(false);
  });

  it('is grey with a reason while a window holds the hero, and empty while growing up or when the house is over', () => {
    const ctx = free(30);
    ctx.state.status = 'awaiting_choice';
    const panel = actionShelves(ctx, null);
    expect(panel.note).toBe('Answer the window first');
    expect(panel.shelves.flatMap((s) => s.buttons).every((b) => b.grey)).toBe(true);
    ctx.state.backstory.running = true;
    expect(actionShelves(ctx, null)).toMatchObject({ shelves: [], note: expect.any(String) });
    ctx.state.backstory.running = false;
    ctx.state.status = 'ended';
    expect(actionShelves(ctx, null).note).toMatch(/end/);
  });
});

describe('people on the screen (D-448)', () => {
  it('the hero knows the family: parents and brothers and sisters are kin, not strangers', () => {
    const ctx = free(25);
    const hero = getPlayer(ctx.state);
    expect(kinship(ctx, hero.id)).toBe('You');
    expect(kinship(ctx, hero.mother ?? '')).toBe('Your mother');
    const sibling = ctx.state.characters.find((c) => c.id !== hero.id && c.mother === hero.mother);
    expect(kinship(ctx, sibling?.id ?? '')).toMatch(/^Your (brother|sister)$/);
    expect(personTip(ctx, hero.mother ?? '')?.text).toMatch(/^Your mother, (aged \d+|dead)\./);
  });

  it('the menu of a person has the page first and the greyed marriage with the reason', () => {
    const ctx = free(25);
    const hero = getPlayer(ctx.state);
    const menu = personMenu(ctx, hero.mother ?? '');
    expect(menu?.items[0]).toMatchObject({ label: 'Open the page', grey: false });
    const wed = menu?.items.find((i) => i.label === 'Propose marriage');
    // a mother and her son: no match is offered, so the line is there, grey, with its reason
    expect(wed).toBeDefined();
    const mother = getPlayer(ctx.state).mother;
    expect(wed).toMatchObject({ grey: true, reason: expect.stringMatching(/.+/) });
    expect(mother).not.toBeNull();
    expect(personMenu(ctx, 'c99999')).toBeNull();
  });
});
