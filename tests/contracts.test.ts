import { describe, expect, it } from 'vitest';
import { botCommand } from '../src/core/bot';
import type { Content } from '../src/core/content/schema';
import { placesInReach } from '../src/core/contracts/board';
import { contractsOnSuccession, postOffer, type Contract } from '../src/core/contracts/contracts';
import { contractsPhase } from '../src/core/contracts/phases';
import { entryText, type ChronicleEntry } from '../src/core/chronicle/log';
import { favorBetween } from '../src/core/favors/favors';
import { apply, newGame } from '../src/core/game';
import { findCharacter, getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { placeDef, placeIdOf, routesFrom, routesFromPlace, setHere } from '../src/core/place/place';
import { seedRng } from '../src/core/rng';
import type { Character, Ctx, GameState } from '../src/core/state';
import { ageYears, fromYmd } from '../src/core/time/calendar';
import { realContent } from './fixtures/content';

const real = realContent();
/** The real content without the scenes of the backstory, so a new game waits for an action at once. */
const content: Content = { ...real, backstory: null };
const board = content.contracts?.board;
if (!board) throw new Error('the real content has no boards');

/** The real content with the chance of every complication set. */
function withChance(chance: number): Content {
  const contracts = content.contracts;
  if (!contracts?.board) throw new Error('no boards');
  return { ...content, contracts: { ...contracts, board: { ...contracts.board, risks: contracts.board.risks.map((r) => ({ ...r, chance })) } } };
}

function game(seed = 1, c: Content = content): { state: GameState; ctx: Ctx; hero: Character } {
  const state = newGame(seed, c);
  return { state, ctx: { state, content: c }, hero: getPlayer(state) };
}

const kindOf = (c: Content, id: string) => c.contracts?.kinds.find((k) => k.id === id);
const clean = (state: GameState, c: Content = content) => expect(checkInvariants(state, c)).toEqual([]);

/** A free grown-up of the circle with an occupation that offers the kind, for offers posted by hand. */
function employerFor(state: GameState, kind: string, c: Content = content): Character {
  const occupations = kindOf(c, kind)?.offer?.employers ?? [];
  const busy = new Set(state.contracts.offers.map((o) => o.employer));
  for (const id of state.circle) {
    const p = findCharacter(state, id);
    if (p && p.deathDay === null && !busy.has(p.id) && occupations.includes(p.occupation as string) && ageYears(p.birthDay, state.day) >= 16) return p;
  }
  throw new Error(`nobody in the circle offers ${kind}`);
}

function postHere(state: GameState, kind: string, level: number, c: Content = content): Contract {
  const here = state.place.here as string;
  return postOffer(state, { kind, place: here, employer: employerFor(state, kind, c).id, level, pay: board?.pay[level] ?? 0, to: null, days: 6, expires: state.day + 30 });
}

/** Days pass until the hero has no action; every window gets its first available answer. */
function runOut(state: GameState, c: Content): string[] {
  const seen: string[] = [];
  for (let i = 0; i < 200 && state.activeAction; i++) {
    if (state.pendingEvent) {
      seen.push(state.pendingEvent.eventId);
      apply(state, c, { type: 'choose', option: 0 });
    } else apply(state, c, { type: 'wait', days: 1 });
  }
  return seen;
}

describe('CK.3: the boards', () => {
  it('a new game finds boards within reach: sizes, employers of the circle, levels and pay, places of the work', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { state } = game(seed);
      const reach = placesInReach(state, content);
      expect(reach).toContain(placeIdOf(state, 'ostmere'));
      expect(state.contracts.posted).toEqual(reach);
      expect(state.contracts.offers.length).toBeGreaterThan(0);
      const employers = new Set<string>();
      for (const o of state.contracts.offers) {
        expect(reach).toContain(o.place);
        const kind = kindOf(content, o.kind)?.offer;
        if (!kind) throw new Error(`kind ${o.kind} is not offered`);
        const employer = findCharacter(state, o.employer) as Character;
        expect(state.circle).toContain(o.employer);
        expect(kind.employers).toContain(employer.occupation);
        expect(employers.has(o.employer)).toBe(false);
        employers.add(o.employer);
        expect(o.level).toBeGreaterThanOrEqual(kind.levels.min);
        expect(o.level).toBeLessThanOrEqual(kind.levels.max);
        expect(o.pay).toBe(board.pay[o.level]);
        expect(kind.places).toContain(placeDef(state, content, o.place)?.kind);
        if (kind.to) {
          const way = routesFromPlace(state, content, o.place).find((w) => w.to === o.to);
          expect(way?.days).toBe(o.days);
          expect(o.days).toBeGreaterThanOrEqual(kind.to.min);
          expect(o.days).toBeLessThanOrEqual(kind.to.max);
        } else expect(o.to).toBeNull();
        expect(o.expires - state.day).toBeGreaterThanOrEqual(board.stay.min);
        expect(o.expires - state.day).toBeLessThanOrEqual(board.stay.max);
      }
      for (const id of reach) {
        const size = board.sizes.find((s) => s.kind === placeDef(state, content, id)?.kind)?.size;
        const here = state.contracts.offers.filter((o) => o.place === id);
        expect(here.length).toBeLessThanOrEqual(size?.max ?? 0);
        // one kind at most twice on a board
        for (const o of here) expect(here.filter((x) => x.kind === o.kind).length).toBeLessThanOrEqual(2);
      }
      clean(state);
    }
  });

  it('draws from a stream of its own: the world goes the same with boards or without, and a seed gives the same boards', () => {
    const contracts = content.contracts;
    if (!contracts) throw new Error('no contracts');
    const without: Content = { ...content, contracts: { ...contracts, board: undefined } };
    const a = newGame(3, content);
    const b = newGame(3, without);
    expect(b.contracts.offers).toEqual([]);
    expect(a.rng).toEqual(b.rng);
    expect(a.circle).toEqual(b.circle);
    expect(newGame(3, content).contracts).toEqual(a.contracts);
  });

  it('a new month tops the boards up; a board that comes within reach later in the month gets its offers then', () => {
    const { state, ctx } = game(2);
    state.contracts.offers = [];
    state.day = fromYmd(1700, 2, 1);
    contractsPhase.run(ctx);
    expect(state.contracts.month).toBe(1700 * 12 + 1);
    expect(state.contracts.posted).toEqual(placesInReach(state, content));
    expect(state.contracts.offers.length).toBeGreaterThan(0);
    // far away: a board out of reach until now
    const far = state.place.places.map((p) => p.id).find((id) => !state.contracts.posted.includes(id) && placeDef(state, content, id)?.kind === 'city');
    if (!far) throw new Error('every city is within reach');
    setHere(ctx, far);
    contractsPhase.run(ctx);
    expect(state.contracts.posted).toContain(far);
    // offers past their last day leave
    state.day = Math.max(...state.contracts.offers.map((o) => o.expires)) + 1;
    state.contracts.month = 1700 * 12 + 1;
    state.contracts.posted = state.place.places.map((p) => p.id);
    contractsPhase.run(ctx);
    expect(state.contracts.offers.filter((o) => o.expires < state.day)).toEqual([]);
  });
});

describe('CK.3: the work', () => {
  it('halfway through the work its complication comes with the employer', () => {
    const sure = withChance(100);
    const { state } = game(1, sure);
    const offer = postHere(state, 'watch', 1, sure);
    apply(state, sure, { type: 'start', actionId: 'contract_work', target: offer.id });
    for (let i = 0; i < 10 && !state.pendingEvent; i++) apply(state, sure, { type: 'wait', days: 1 });
    expect(state.pendingEvent?.eventId).toBe('shutters_at_night');
    expect(state.pendingEvent?.scope.employer).toBe(offer.employer);
    expect(state.day).toBe(offer.days / 2 + (state.contracts.current?.start ?? 0));
    clean(state, sure);
  });

  it('no complication without its chance: the work ends quietly as a success', () => {
    const never = withChance(0);
    const { state, hero } = game(1, never);
    const offer = postHere(state, 'watch', 1, never);
    const money = hero.money;
    apply(state, never, { type: 'start', actionId: 'contract_work', target: offer.id });
    expect(runOut(state, never)).not.toContain('shutters_at_night');
    expect(state.contracts.current).toBeNull();
    expect(hero.money).toBeGreaterThanOrEqual(money + 15);
  });

  it('the chronicle gets successes from level 2 and every failure; from level 2 the employer owes a favor', () => {
    const never = withChance(0);
    const { state, hero } = game(4, never);
    const line = () => state.chronicle.filter((e) => e.kind === 'contract').at(-1);
    const low = postHere(state, 'debt', 1, never);
    apply(state, never, { type: 'start', actionId: 'contract_work', target: low.id });
    runOut(state, never);
    expect(line()?.level).toBe('journal');
    expect(favorBetween(state, low.employer, hero.id)).toBeNull();
    const high = postHere(state, 'debt', 2, never);
    apply(state, never, { type: 'start', actionId: 'contract_work', target: high.id });
    runOut(state, never);
    expect(line()?.level).toBe('chronicle');
    expect(favorBetween(state, high.employer, hero.id)?.strength).toBe('weak');
    // work left unfinished: the line of `texts.left`; a failure from level 1 goes to the chronicle, of level 0 to the journal
    const left = postHere(state, 'watch', 1, never);
    apply(state, never, { type: 'start', actionId: 'contract_work', target: left.id });
    apply(state, never, { type: 'wait', days: 1 });
    apply(state, never, { type: 'start', actionId: 'rest' });
    expect(line()?.level).toBe('chronicle');
    expect(entryText(line() as ChronicleEntry)).toContain('unfinished');
    expect(state.contracts.last).toMatchObject({ id: left.id, outcome: 'failure', left: true, pay: 0 });
    const small = postHere(state, 'watch', 0, never);
    apply(state, never, { type: 'start', actionId: 'contract_work', target: small.id });
    apply(state, never, { type: 'wait', days: 1 });
    apply(state, never, { type: 'start', actionId: 'rest' });
    expect(line()?.level).toBe('journal');
    clean(state, never);
  });

  it('a board within reach of the place of arrival is there on the day of arrival, with no other command', () => {
    for (const seed of [1, 2, 3]) {
      const { state, ctx } = game(seed);
      const journey = content.actions.find((a) => a.target === 'place');
      const far = routesFrom(state, content).sort((a, b) => b.days - a.days)[0];
      if (!journey || !far) throw new Error('no journey');
      apply(state, content, { type: 'start', actionId: journey.id, target: far.to });
      for (let i = 0; i < 400 && state.activeAction; i++) apply(state, content, state.pendingEvent ? { type: 'choose', option: 0 } : { type: 'wait', days: 1 });
      if (state.place.here !== far.to) continue;
      expect(state.status).toBe('awaiting_action');
      for (const id of placesInReach(state, content)) expect(state.contracts.posted).toContain(id);
      clean(state);
    }
  });

  it('the end of the house drops the work under way; the new head offers no work to himself', () => {
    const { state, ctx } = game(1);
    const offer = postHere(state, 'watch', 1);
    apply(state, content, { type: 'start', actionId: 'contract_work', target: offer.id });
    apply(state, content, { type: 'end' });
    expect(state.contracts.current).toBeNull();
    clean(state);
    const other = game(2);
    const heir = employerFor(other.state, 'watch');
    postHere(other.state, 'watch', 0);
    contractsOnSuccession(other.ctx, getPlayer(other.state), heir);
    expect(other.state.contracts.offers.some((o) => o.employer === heir.id)).toBe(false);
    void ctx;
  });

  it('a letter of level 3 leaves the employer owing a strong favor', () => {
    const never = withChance(0);
    const { state, hero } = game(5, never);
    state.contracts.offers = [];
    const here = state.place.here as string;
    const way = routesFromPlace(state, never, here)[0];
    if (!way) throw new Error('no way');
    const offer = postOffer(state, { kind: 'letter', place: here, employer: employerFor(state, 'letter', never).id, level: 3, pay: 60, to: way.to, days: way.days, expires: state.day + 30 });
    apply(state, never, { type: 'start', actionId: 'contract_work', target: offer.id });
    runOut(state, never);
    expect(state.place.here).toBe(way.to);
    expect(favorBetween(state, offer.employer, hero.id)?.strength).toBe('strong');
  });

  it('a cautious bot takes the safest work on the board, a greedy one the best paid', () => {
    const { state } = game(1);
    state.contracts.offers = [];
    const watch = postHere(state, 'watch', 0);
    const debt = postHere(state, 'debt', 2);
    const cmd = (character: 'cautious' | 'greedy') => {
      for (let seed = 1; seed < 60; seed++) {
        const c = botCommand(state, content, seedRng(seed, 9), character);
        if (c.type === 'start' && c.actionId === 'contract_work') return c.target;
      }
      return null;
    };
    expect(cmd('cautious')).toBe(watch.id);
    expect(cmd('greedy')).toBe(debt.id);
  });
});
