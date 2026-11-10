import { describe, expect, it } from 'vitest';
import { apply, newGame, play } from '../src/core/game';
import { botCommand } from '../src/core/bot';
import { getPlayer } from '../src/core/helpers';
import { seedRng } from '../src/core/rng';
import type { GameState } from '../src/core/state';
import { placeActions } from '../src/ui/actions-model';
import { sidebarPage } from '../src/ui/sidebar-model';
import { realContent } from './fixtures/content';

/** Playtest 09.11: a click on a town gives something to do — the deeds of the place where the hero is, the way there elsewhere. */
describe('what a place offers on its page', () => {
  const content = realContent();
  function grownUp(seed: number): GameState {
    const state = newGame(seed, content);
    const rng = seedRng(seed, 77);
    for (let i = 0; i < 200 && state.backstory.running; i++) play(state, content, botCommand(state, content, rng));
    while (state.status === 'awaiting_choice') play(state, content, botCommand(state, content, rng));
    return state;
  }

  it('offers the deeds of the place the hero stands in, as the actions panel has them', () => {
    const state = grownUp(1);
    const here = state.place.here as string;
    const offers = placeActions({ state, content }, here);
    expect(offers?.here).toBe(true);
    expect(offers?.travel).toBeNull();
    expect(offers?.buttons.map((b) => b.id)).toContain('serve_contract');
    expect(offers?.buttons.some((b) => !b.grey)).toBe(true);
    expect(offers?.buttons.map((b) => b.id)).not.toContain('travel');
    // what a town never allows (hunting is for a village or the road) is not offered in a town
    expect(offers?.buttons.map((b) => b.id)).not.toContain('hunt');
    const page = sidebarPage({ state, content }, here);
    expect(page.blocks.some((b) => b.type === 'heading' && b.text === 'Here you can')).toBe(true);
  });

  it('offers the journey to another place, with its days and price, and says what can be done there', () => {
    const state = grownUp(1);
    getPlayer(state).money = 100;
    const other = state.place.places.find((p) => p.id !== state.place.here && placeActions({ state, content }, p.id)?.travel?.grey === false);
    expect(other).toBeDefined();
    const offers = placeActions({ state, content }, other?.id ?? '');
    expect(offers?.here).toBe(false);
    expect(offers?.travel?.name).toMatch(/^Travel to /);
    expect(offers?.travel?.info.join(' · ')).toMatch(/\d+ days? · costs 5 crowns/);
    expect(offers?.there.length).toBeGreaterThan(0);
  });

  it('offers nothing while the backstory runs', () => {
    const state = newGame(1, content);
    expect(placeActions({ state, content }, state.place.places[0]?.id ?? '')).toBeNull();
  });

  it('keeps "Travel to" for the place the hero is already going to, grey with the reason', () => {
    const state = grownUp(1);
    getPlayer(state).money = 100;
    const other = state.place.places.find((p) => p.id !== state.place.here && placeActions({ state, content }, p.id)?.travel?.grey === false);
    apply(state, content, { type: 'start', actionId: 'travel', target: other?.id ?? '' });
    apply(state, content, { type: 'wait', days: 1 });
    const offers = placeActions({ state, content }, other?.id ?? '');
    expect(offers?.travel?.name).toMatch(/^Travel to /);
    expect(offers?.travel?.grey).toBe(true);
    expect(offers?.travel?.reason).toBe('you are going there');
  });
});
