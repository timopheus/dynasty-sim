import { describe, expect, it } from 'vitest';
import { apply, newGame, play } from '../src/core/game';
import { botCommand } from '../src/core/bot';
import { getPlayer } from '../src/core/helpers';
import { seedRng } from '../src/core/rng';
import type { GameState } from '../src/core/state';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapProps } from '../src/ui/map/game';
import { buildModel, type MapFile } from '../src/ui/map/model';
import { realContent } from './fixtures/content';

/** M.1: what the map shows of the game — the places, the hero where he is, the travel from the menu of a place. */
describe('the map and the game (M.1)', () => {
  const content = realContent();
  function grownUp(seed: number): GameState {
    const state = newGame(seed, content);
    const rng = seedRng(seed, 77);
    for (let i = 0; i < 200 && state.backstory.running; i++) play(state, content, botCommand(state, content, rng));
    while (state.status === 'awaiting_choice') play(state, content, botCommand(state, content, rng));
    return state;
  }
  const noop = { open: () => {}, travel: () => {} };
  const model = buildModel(JSON.parse(readFileSync(join(import.meta.dirname, '../src/ui/map/region-map.json'), 'utf8')) as MapFile);

  it('puts every place of the game on the map, and the hero in his place', () => {
    const state = grownUp(1);
    const props = mapProps({ state, content }, model, noop);
    expect(props.places.length).toBe(state.place.places.length);
    const here = props.places.find((p) => p.id === state.place.here);
    expect(here).toBeDefined();
    expect(props.hero).toEqual(here?.at);
    expect(props.journey).toBeNull();
    expect(props.roads.length).toBeGreaterThan(0);
  });

  it('offers travel to a place with a road, not to the place the hero stands in, and starts it on the road', () => {
    const state = grownUp(1);
    getPlayer(state).money = 100;
    const calls: [string, string][] = [];
    const props = mapProps({ state, content }, model, { open: () => {}, travel: (a, id) => calls.push([a, id]) });
    const here = state.place.here as string;
    expect(props.travel(here).enabled).toBe(false);
    const other = props.places.find((p) => p.id !== here && props.travel(p.id).enabled);
    expect(other, 'a place to travel to').toBeDefined();
    expect(props.travel(other?.id ?? '').label).toMatch(/^Travel to .+ \(\d+ days?\)$/);
    props.onTravel(other?.id ?? '');
    expect(calls).toHaveLength(1);
    const [actionId, target] = calls[0] as [string, string];
    apply(state, content, { type: 'start', actionId, target });
    apply(state, content, { type: 'wait', days: 1 });
    const moving = mapProps({ state, content }, model, noop);
    expect(moving.journey?.to).toEqual(props.places.find((p) => p.id === target)?.at);
    expect(moving.hero).not.toEqual(props.hero);
  });
});
