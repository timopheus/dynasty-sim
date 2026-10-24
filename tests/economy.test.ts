import { describe, expect, it } from 'vitest';
import { conditionReport } from '../src/core/condition-keys';
import { lowestCrowns, priceCrowns, referenceIncome } from '../src/core/economy/economy';
import { applyEffects } from '../src/core/effects';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { houseOf } from '../src/core/house/house';
import { checkInvariants } from '../src/core/invariants';
import { fixtureContent, realContent } from './fixtures/content';

/** The points of the economy (S.5a, D-441): prices by level as parts of the reference income of the house status. */
describe('economy points (D-441)', () => {
  const content = realContent();

  it('prices a level as a part of the income of the house status, never below a crown a time', () => {
    const state = newGame(1, content);
    const hero = getPlayer(state);
    expect(houseOf(state, hero)?.status).toBe('commoner');
    expect(referenceIncome(content, state, hero)).toBe(15);
    const at = (ref: Parameters<typeof priceCrowns>[3]) => priceCrowns(content, state, hero, ref);
    expect([at('trifle'), at('minor'), at('notable'), at('major'), at('ruinous')]).toEqual([1, 5, 15, 60, 180]);
    expect(at({ level: 'notable', times: 2 })).toBe(30);
    const house = houseOf(state, hero);
    if (!house) throw new Error('no house');
    house.status = 'guild';
    expect([at('trifle'), at('minor'), at('notable')]).toEqual([5, 16, 50]);
  });

  it('pay and gain move the money of the character of the block', () => {
    const state = newGame(1, content);
    const hero = getPlayer(state);
    const scope = { hero: hero.id, protagonist: hero.id };
    const before = hero.money;
    applyEffects({ state, content }, hero, { pay: 'notable' }, scope);
    expect(hero.money).toBe(before - 15);
    applyEffects({ state, content }, hero, { gain: { level: 'minor', times: 3 } }, scope);
    expect(hero.money).toBe(before);
  });

  it('can_afford is unmet with a reason the hero sees while the money is short', () => {
    const state = newGame(1, content);
    const hero = getPlayer(state);
    const scope = { hero: hero.id, protagonist: hero.id };
    hero.money = 59;
    const short = conditionReport({ state, content }, hero, { can_afford: 'major' }, scope);
    expect(short.met).toBe(false);
    expect(short.reasons).toEqual(['Requires 60 crowns.']);
    hero.money = 60;
    expect(conditionReport({ state, content }, hero, { can_afford: 'major' }, scope).met).toBe(true);
  });

  it('bots count a price at the lowest income', () => {
    expect(lowestCrowns(content, 'minor')).toBe(5);
    expect(lowestCrowns(content, { level: 'major', times: 2 })).toBe(120);
  });

  it('without the key, prices are nothing and can_afford is a hidden reason', () => {
    const bare = fixtureContent();
    const state = newGame(1, bare);
    const hero = getPlayer(state);
    expect(priceCrowns(bare, state, hero, 'minor')).toBe(0);
    const report = conditionReport({ state, content: bare }, hero, { can_afford: 'minor' }, { hero: hero.id, protagonist: hero.id });
    expect(report.met).toBe(false);
    expect(report.hidden).toBe(true);
  });

  it('keeps its part of the state whole', () => {
    const state = newGame(1, content);
    expect(state.economy).toEqual({ balance: null });
    expect(checkInvariants(state, content)).toEqual([]);
    expect(checkInvariants({ ...state, economy: { balance: 1.5 } }, content)).toContain('economy: balance is not a whole number: 1.5');
  });
});
