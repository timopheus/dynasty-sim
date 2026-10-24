import { describe, expect, it } from 'vitest';
import { conditionReport } from '../src/core/condition-keys';
import { lowestCrowns, priceCrowns, referenceIncome } from '../src/core/economy/economy';
import { monthlyBalance } from '../src/core/economy/balance';
import { economyPhase } from '../src/core/economy/phases';
import { applyEffects } from '../src/core/effects';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/hooks';
import { houseOf } from '../src/core/house/house';
import { checkInvariants } from '../src/core/invariants';
import type { Character, Ctx, GameState } from '../src/core/state';
import { fromYmd, toYmd } from '../src/core/time/calendar';
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
    expect(short.reasons).toEqual(['Requires 60 crowns']);
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
    expect(state.economy).toEqual({ balance: null, month: null, debtYear: null });
    expect(checkInvariants(state, content)).toEqual([]);
    expect(checkInvariants({ ...state, economy: { balance: 1.5, month: null, debtYear: null } }, content)).toContain('economy: balance is not a whole number: 1.5');
  });
});

/** The monthly balance (S.7, D-441): the numbers of the reference table `docs/reference/prices-1700.md`, section 3. */
describe('monthly balance (S.7)', () => {
  const content = realContent();

  /** A hero of plain Stewardship (5), no traits, no kin, doing `action`, of the house status `status`. */
  function setup(action: string | null, status = 'commoner') {
    const state = newGame(1, content);
    const ctx: Ctx = { state, content };
    const hero = getPlayer(state);
    hero.baseStats.stewardship = 5;
    hero.traits = [];
    hero.spouse = null;
    state.activeAction = action === null ? null : { actionId: action, endDay: state.day + 100 };
    const house = houseOf(state, hero);
    if (!house) throw new Error('no house');
    house.status = status;
    return { state, ctx, hero };
  }

  function person(ctx: Ctx, age: number, parent?: Character): Character {
    const c = createCharacter(ctx, { surname: 'Smith', age: { min: age, max: age }, ...(parent ? { father: parent.id } : {}) });
    c.occupation = 'guard';
    return c;
  }

  /** A wife and two children under age. */
  function family({ state, ctx, hero }: ReturnType<typeof setup>): void {
    const wife = person(ctx, 25);
    wife.sex = 'female';
    hero.spouse = wife.id;
    wife.spouse = hero.id;
    state.marriages.push({ a: hero.id, b: wife.id, start: state.day, end: null, endReason: null });
    person(ctx, 3, hero);
    person(ctx, 6, hero);
  }

  const total = (s: ReturnType<typeof setup>) => monthlyBalance(s.ctx, s.hero).total;

  it('a single commoner: +8 in service, 0 living', () => {
    expect(total(setup('serve_contract'))).toBe(8);
    expect(total(setup('live'))).toBe(-7);
    expect(total(setup('hunt'))).toBe(-1);
    expect(total(setup('travel'))).toBe(-7);
  });

  it('a commoner with a wife and two children: +3 in service, −5 living', () => {
    const served = setup('serve_contract');
    family(served);
    expect(total(served)).toBe(3);
    expect(monthlyBalance(served.ctx, served.hero).lines.map((l) => [l.id, l.amount])).toEqual([['work', 15], ['living', -7], ['spouse', -3], ['children', -2]]);
    const idle = setup('trade');
    family(idle);
    idle.state.activeAction = null;
    expect(total(idle)).toBe(-12);
  });

  it('guild and noble follow the table', () => {
    expect(total(setup('trade', 'guild'))).toBe(20);
    expect(total(setup('trade', 'noble'))).toBe(50);
    const noble = setup('serve_contract', 'noble');
    family(noble);
    expect(total(noble)).toBe(-30);
    const guild = setup('trade', 'guild');
    family(guild);
    expect(total(guild)).toBe(0);
  });

  it('a hero under age pays the small share and has no income', () => {
    const s = setup('grow_up');
    s.hero.birthDay = fromYmd(toYmd(s.state.day).year - 10, 1, 1);
    expect(monthlyBalance(s.ctx, s.hero)).toEqual({ total: -1, lines: [{ id: 'living', label: 'Living costs', amount: -1 }] });
  });

  it('Stewardship, education and traits change the sums by whole percents, within ±30', () => {
    const s = setup('serve_contract', 'guild');
    s.hero.baseStats.stewardship = 10;
    // Stewardship 10: +10 % income, −10 % upkeep.
    expect(total(s)).toBe(55 - 27);
    // diligent: Stewardship 7 (+4 %, −4 %) and +10 % income.
    s.hero.baseStats.stewardship = 5;
    s.hero.traits = ['diligent'];
    expect(total(s)).toBe(57 - 28);
    // greedy: Stewardship 7 (+4 %, −4 %) and −10 % upkeep.
    s.hero.traits = ['greedy'];
    expect(total(s)).toBe(52 - 25);
    // a stewardship education of level 2: Stewardship 9 (+8 %, −8 %) and +10 % income.
    s.hero.traits = ['stewardship_2'];
    expect(total(s)).toBe(59 - 27);
    // lazy and generous: Stewardship 2 (−6 %, +6 %), −10 % income, +10 % upkeep.
    s.hero.traits = ['lazy', 'generous'];
    expect(total(s)).toBe(42 - 34);
    // far over the cap: +30 % income, −30 % upkeep.
    s.hero.traits = [];
    s.hero.baseStats.stewardship = 20;
    expect(total(s)).toBe(65 - 21);
  });

  it('a query: neither randomness nor state is touched', () => {
    const s = setup('serve_contract');
    const before = JSON.stringify(s.state);
    monthlyBalance(s.ctx, s.hero);
    expect(JSON.stringify(s.state)).toBe(before);
  });

  /** Runs the days of `state` by hand until `day`, as the loop does: the phase sees every day. */
  function runTo(state: GameState, day: number): void {
    const phase = content.economy ? economyPhase : null;
    while (state.day < day) {
      state.day += 1;
      phase?.run({ state, content });
    }
  }

  it('on the first of each month the hero gets the balance, without a line in the chronicle', () => {
    const s = setup('serve_contract');
    s.state.activeAction = { actionId: 'serve_contract', endDay: 100000 };
    const money = s.hero.money;
    const lines = s.state.chronicle.length;
    runTo(s.state, fromYmd(1700, 4, 1));
    // The first day only notes the month; Feb, Mar and Apr pay.
    expect(s.hero.money).toBe(money + 3 * 8);
    expect(s.state.economy.balance).toBe(8);
    expect(s.state.chronicle.length).toBe(lines);
  });

  it('a day the phase never sees does not lose the month', () => {
    const s = setup('serve_contract');
    s.state.activeAction = { actionId: 'serve_contract', endDay: 100000 };
    const money = s.hero.money;
    runTo(s.state, fromYmd(1700, 1, 20));
    // Feb 1 and Mar 1 are skipped by an event; the phase runs again on Mar 2.
    s.state.day = fromYmd(1700, 3, 1);
    runTo(s.state, fromYmd(1700, 3, 2));
    expect(s.hero.money).toBe(money + 2 * 8);
    expect(s.state.economy.month).toBe(1700 * 12 + 2);
  });

  it('going into debt writes one line and not more often than once a year', () => {
    const s = setup('travel');
    s.state.activeAction = { actionId: 'travel', endDay: 100000 };
    s.state.pendingEvent = null;
    s.hero.money = 10;
    const debt = () => s.state.chronicle.filter((e) => e.kind === 'economy').length;
    runTo(s.state, fromYmd(1700, 4, 1));
    expect(s.hero.money).toBeLessThan(0);
    expect(debt()).toBe(1);
    s.hero.money = 1;
    runTo(s.state, fromYmd(1700, 12, 31));
    expect(debt()).toBe(1);
    s.hero.money = 1;
    runTo(s.state, fromYmd(1701, 3, 1));
    expect(debt()).toBe(2);
    expect(checkInvariants(s.state, content).filter((p) => p.startsWith('economy'))).toEqual([]);
  });
});
