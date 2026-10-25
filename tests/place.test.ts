import { describe, expect, it } from 'vitest';
import { actionAvailability } from '../src/core/actions/actions';
import { botCommand } from '../src/core/bot';
import { conditionReport } from '../src/core/condition-keys';
import type { Content } from '../src/core/content/schema';
import { entityExists, kindOf } from '../src/core/entities/registry';
import { eventWeight, findEvent } from '../src/core/events/events';
import { eventView } from '../src/core/events/view';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/hooks';
import { checkInvariants } from '../src/core/invariants';
import { heroPlaceKind, placeIdOf, position, routesFrom } from '../src/core/place/place';
import { seedRng } from '../src/core/rng';
import type { Ctx, GameState } from '../src/core/state';
import { BASE_FILES, fixtureContent, loadOrThrow } from './fixtures/content';
import { readContentFiles } from '../tools/content-files';

const content = loadOrThrow([...BASE_FILES, ...readContentFiles('tests/fixtures/places')]);

function game(c: Content = content): { state: GameState; ctx: Ctx } {
  const state = newGame(1, c);
  return { state, ctx: { state, content: c } };
}

const id = (state: GameState, key: string): string => {
  const found = placeIdOf(state, key);
  if (found === null) throw new Error(`no place ${key}`);
  return found;
};

/** Lets the days pass until the action ends; an event gets its last available answer (the base event `ping` wounds on its first). */
function runOut(state: GameState, c: Content = content): void {
  for (let i = 0; i < 400 && state.activeAction; i++) {
    if (state.status === 'awaiting_choice') {
      const options = eventView({ state, content: c })?.options.filter((o) => o.available) ?? [];
      apply(state, c, { type: 'choose', option: (options.at(-1) as { index: number }).index });
    } else apply(state, c, { type: 'wait', days: 1 });
  }
}

describe('place (S.9a)', () => {
  it('gives every place a record p… in the order of the content and puts the hero in the start', () => {
    const { state, ctx } = game();
    expect(state.place.places.map((p) => p.key)).toEqual(['ostmere', 'valmont', 'meschevsk', 'rohrbach']);
    for (const p of state.place.places) {
      expect(p.id).toMatch(/^p\d+$/);
      expect(kindOf(p.id)?.word).toBe('place');
      expect(entityExists(ctx, p.id)).toBe(true);
    }
    expect(state.place.here).toBe(id(state, 'ostmere'));
    expect(position(state, content)).toEqual({ at: id(state, 'ostmere') });
    expect(heroPlaceKind(state, content)).toBe('town');
    expect(routesFrom(state, content)).toEqual([
      { to: id(state, 'valmont'), days: 6 },
      { to: id(state, 'meschevsk'), days: 3 },
    ]);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('leaves the state without places when the content has none', () => {
    const base = fixtureContent();
    const { state } = game(base);
    expect(state.place).toEqual({ here: null, places: [] });
    expect(position(state, base)).toBeNull();
    expect(heroPlaceKind(state, base)).toBeNull();
    expect(checkInvariants(state, base)).toEqual([]);
  });

  it('starts a journey to a place a road leads to: the days of the road, no roll', () => {
    const { state } = game();
    const rng = JSON.stringify(state.rng);
    const day = state.day;
    apply(state, content, { type: 'start', actionId: 'journey', target: id(state, 'valmont') });
    expect(JSON.stringify(state.rng)).toBe(rng);
    expect(state.activeAction).toEqual({ actionId: 'journey', endDay: day + 6, target: id(state, 'valmont') });
    expect(position(state, content)).toEqual({ road: { from: id(state, 'ostmere'), to: id(state, 'valmont'), arriveDay: day + 6 } });
    expect(heroPlaceKind(state, content)).toBe('road');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('refuses a journey without a place, to a place no road leads to, and a target for an action that takes none', () => {
    const { state } = game();
    expect(() => apply(state, content, { type: 'start', actionId: 'journey' })).toThrow(/needs a place/);
    expect(() => apply(state, content, { type: 'start', actionId: 'journey', target: id(state, 'rohrbach') })).toThrow(/No road/);
    expect(() => apply(state, content, { type: 'start', actionId: 'market', target: id(state, 'valmont') })).toThrow(/takes no target/);
    expect(state.activeAction).toBeNull();
  });

  it('brings the hero to the place on the last day of the road', () => {
    const { state } = game();
    apply(state, content, { type: 'start', actionId: 'journey', target: id(state, 'meschevsk') });
    runOut(state);
    expect(state.place.here).toBe(id(state, 'meschevsk'));
    expect(heroPlaceKind(state, content)).toBe('village');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('leaves the hero where he set out from when the road is broken off', () => {
    const { state } = game();
    apply(state, content, { type: 'start', actionId: 'journey', target: id(state, 'valmont') });
    apply(state, content, { type: 'start', actionId: 'rest' });
    expect(state.place.here).toBe(id(state, 'ostmere'));
    expect(position(state, content)).toEqual({ at: id(state, 'ostmere') });
    runOut(state);
    expect(state.place.here).toBe(id(state, 'ostmere'));
  });

  it('weighs an event bound to kinds of places only where the hero is, and with actions only when both hold', () => {
    const { state, ctx } = game();
    const hero = getPlayer(state);
    const road = findEvent(content, 'highwaymen');
    const crier = findEvent(content, 'town_crier');
    expect(eventWeight(ctx, road, hero)).toBe(0);
    expect(eventWeight(ctx, crier, hero)).toBe(0);
    apply(state, content, { type: 'start', actionId: 'market' });
    expect(eventWeight(ctx, crier, hero)).toBe(10);
    apply(state, content, { type: 'start', actionId: 'journey', target: id(state, 'valmont') });
    expect(eventWeight(ctx, road, hero)).toBe(10);
    expect(eventWeight(ctx, crier, hero)).toBe(0);
  });

  it('tells why an action of towns or a condition of a place is unmet, and hides it for anyone but the hero', () => {
    const { state, ctx } = game();
    const hero = getPlayer(state);
    const scope = { hero: hero.id, protagonist: hero.id };
    const market = () => actionAvailability(ctx).find((a) => a.action.id === 'market');
    expect(market()?.unmet).toEqual([]);
    expect(conditionReport(ctx, hero, { at_place: ['valmont', 'rohrbach'] }, scope).reasons).toEqual(['Only in Valmont or Rohrbach']);
    expect(conditionReport(ctx, hero, { at_place: ['ostmere'] }, scope).met).toBe(true);
    apply(state, content, { type: 'start', actionId: 'journey', target: id(state, 'valmont') });
    expect(market()?.unmet).toEqual(['Only in a town']);
    expect(conditionReport(ctx, hero, { at_place_kind: ['road'] }, scope).met).toBe(true);
    expect(conditionReport(ctx, hero, { at_place: ['ostmere'] }, scope).reasons).toEqual(['Only in Ostmere']);
    const other = createCharacter(ctx, { surname: 'Other', age: { min: 30, max: 30 } });
    const report = conditionReport(ctx, other, { at_place_kind: ['road'] }, { hero: hero.id, protagonist: other.id });
    expect(report.met).toBe(false);
    expect(report.hidden).toBe(true);
  });

  it('shows a journey grey when no road leads anywhere', () => {
    const places = content.places;
    if (!places) throw new Error('no places');
    const lonely: Content = { ...content, places: { ...places, list: places.list.slice(0, 1), roads: [] } };
    const { ctx } = game(lonely);
    expect(actionAvailability(ctx).find((a) => a.action.id === 'journey')?.unmet).toEqual(['No road leads anywhere from here']);
  });

  it('catches a hero in an unknown place and a record of an unknown place', () => {
    const { state } = game();
    state.place.here = 'p999';
    expect(checkInvariants(state, content)).toContain('the hero is in unknown place p999');
    const other = game().state;
    (other.place.places[0] as { key: string }).key = 'nowhere';
    expect(checkInvariants(other, content).some((p) => p.includes('unknown place nowhere'))).toBe(true);
  });

  it('lets a bot go somewhere a road leads, by its own generator', () => {
    const { state } = game();
    const routes = routesFrom(state, content).map((r) => r.to);
    let seen = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const cmd = botCommand(state, content, seedRng(seed));
      if (cmd.type === 'start' && cmd.actionId === 'journey') {
        seen += 1;
        expect(routes).toContain(cmd.target);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('keeps the state plain JSON on the road', () => {
    const { state } = game();
    apply(state, content, { type: 'start', actionId: 'journey', target: id(state, 'valmont') });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
