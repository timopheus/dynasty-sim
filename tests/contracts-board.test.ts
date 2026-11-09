import { describe, expect, it } from 'vitest';
import type { Content } from '../src/core/content/schema';
import { apply, newGame } from '../src/core/game';
import { routesFrom } from '../src/core/place/place';
import { actionShelves, BOARD_ID } from '../src/ui/actions-model';
import { boardView, levelDots, offersByPlace, workLine } from '../src/ui/contracts-model';
import { whereView } from '../src/ui/where-model';
import { realContent } from './fixtures/content';

const content: Content = { ...realContent(), backstory: null };

function game(seed = 1) {
  const state = newGame(seed, content);
  return { state, ctx: { state, content } };
}

describe('CK.4: the work board', () => {
  it('lists the boards within reach, the place of the hero first, and chooses the first offer here', () => {
    const { state, ctx } = game(1);
    const view = boardView(ctx, null);
    expect(view.empty).toBeNull();
    expect(view.places[0]?.here).toBe(true);
    const days = view.places.map((p) => p.days);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(view.places.reduce((n, p) => n + p.offers.length, 0)).toBe(state.contracts.offers.length);
    const first = view.places[0]?.offers[0];
    expect(view.selected?.id).toBe(first?.id);
    expect(view.selected?.take).toEqual({ enabled: true, reason: '' });
    expect(view.selected?.risk).toMatch(/^(Low|Notable|High): \d+% chance of trouble$/);
    expect(view.selected?.success[0]).toBe(`${first?.pay} crowns`);
    expect(levelDots(2)).toBe('●●○');
  });

  it('work on another board is grey until the hero goes there, and offers the way', () => {
    const { ctx } = game(1);
    const view = boardView(ctx, null);
    const far = view.places.find((p) => !p.here);
    if (!far) throw new Error('no other board within reach');
    const other = boardView(ctx, far.offers[0]?.id ?? null);
    expect(other.selected?.take).toEqual({ enabled: false, reason: `Go to ${far.name} first` });
    expect(other.selected?.travel?.target).toBe(far.id);
    expect(other.selected?.travel?.label).toContain(`Travel to ${far.name}`);
  });

  it('taken work stands in the block "where I am" and on the board; no second job', () => {
    const { state, ctx } = game(1);
    const offer = boardView(ctx, null).selected;
    if (!offer) throw new Error('no offer');
    apply(state, content, { type: 'start', actionId: 'contract_work', target: offer.id });
    const line = workLine(ctx);
    expect(line).toContain(offer.title);
    expect(whereView(ctx).heading).toBe(`Work: ${line}`);
    const after = boardView(ctx, null);
    expect(after.current).toBe(line);
    if (after.selected) expect(after.selected.take).toEqual({ enabled: false, reason: 'You already have work' });
    for (const p of after.places) for (const o of p.offers) expect(boardView(ctx, o.id).selected?.travel).toBeNull();
  });

  it('the panel has the board button with the offers within reach; the map pins count the offers of each board', () => {
    const { state, ctx } = game(2);
    const counts = offersByPlace(ctx);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(state.contracts.offers.length);
    const here = counts.get(state.place.here as string) ?? 0;
    const panel = actionShelves(ctx, null, { offers: total, here });
    const button = panel.shelves.find((s) => s.category === 'livelihood')?.buttons[0];
    expect(button?.id).toBe(BOARD_ID);
    expect(button?.info[0]).toBe(`${total} within reach`);
    expect(panel.shelves.flatMap((s) => s.buttons).some((b) => b.id === 'contract_work')).toBe(false);
    expect(routesFrom(state, content).length).toBeGreaterThan(0);
  });
});
