import { describe, expect, it } from 'vitest';
import { actionAvailability } from '../src/core/actions/actions';
import { botCommand } from '../src/core/bot';
import { fullName } from '../src/core/character/character';
import { conditionReport } from '../src/core/condition-keys';
import { loadContent } from '../src/core/content/load';
import type { Content } from '../src/core/content/schema';
import { contractsRefs, postOffer, type Contract } from '../src/core/contracts/contracts';
import { applyEffects } from '../src/core/effects';
import { eventWeight, findEvent } from '../src/core/events/events';
import { eventView } from '../src/core/events/view';
import { favorBetween, favorsOnSuccession, favorsRefs, grantFavor } from '../src/core/favors/favors';
import { apply, newGame } from '../src/core/game';
import { findCharacter, getPlayer } from '../src/core/helpers';
import { interactionAvailability } from '../src/core/interactions/phases';
import { checkInvariants } from '../src/core/invariants';
import { kill } from '../src/core/lifecycle';
import { placeIdOf, position } from '../src/core/place/place';
import { hotRefs } from '../src/core/refs';
import { opinionValue } from '../src/core/relations/opinions';
import { seedRng } from '../src/core/rng';
import type { Character, Ctx, GameState } from '../src/core/state';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, loadOrThrow } from './fixtures/content';

const FILES = [
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/places'),
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions'),
  ...readContentFiles('tests/fixtures/contracts'),
];
const loaded = loadOrThrow(FILES);
// the circle stays as it is, so the employer stays near the hero
const content: Content = { ...loaded, population: loaded.population ? { ...loaded.population, driftPer10k: 0, arriveFromFarPer100: 0 } : null };

function game(c: Content = content): { state: GameState; ctx: Ctx; hero: Character; employer: Character } {
  const state = newGame(1, c);
  const employer = findCharacter(state, state.circle[0] as string);
  if (!employer) throw new Error('no circle');
  return { state, ctx: { state, content: c }, hero: getPlayer(state), employer };
}

const place = (state: GameState, key: string): string => {
  const found = placeIdOf(state, key);
  if (found === null) throw new Error(`no place ${key}`);
  return found;
};

function post(state: GameState, employer: Character, over: Partial<Omit<Contract, 'id'>> = {}): Contract {
  return postOffer(state, { kind: 'letter', place: place(state, 'ostmere'), employer: employer.id, level: 1, pay: 15, to: null, days: 4, expires: state.day + 30, ...over });
}

const clean = (state: GameState, c: Content = content) => expect(checkInvariants(state, c)).toEqual([]);
const workReasons = (ctx: Ctx) => actionAvailability(ctx).find((a) => a.action.id === 'work')?.unmet;
const lastLine = (state: GameState) => state.chronicle.at(-1);
const text = (state: GameState) => (lastLine(state)?.parts ?? []).map((p) => (typeof p === 'string' ? p : p.name)).join('');

/** Lets the days pass until the hero has no action; an event gets its first available answer. */
function runOut(state: GameState, c: Content = content): void {
  for (let i = 0; i < 100 && state.activeAction; i++) {
    if (state.status === 'awaiting_choice') {
      const option = eventView({ state, content: c })?.options.find((o) => o.available);
      apply(state, c, { type: 'choose', option: option?.index ?? 0 });
    } else apply(state, c, { type: 'wait', days: 1 });
    clean(state, c);
  }
}

describe('CK.2a: contracts', () => {
  it('takes an offer from the board where the hero stands: the action serves it for the days of the work', () => {
    const { state, ctx, employer } = game();
    expect(workReasons(ctx)).toEqual(['No work on the board here']);
    // an offer of another board is not the hero's to take
    post(state, employer, { place: place(state, 'valmont') });
    expect(workReasons(ctx)).toEqual(['No work on the board here']);
    const offer = post(state, employer);
    expect(offer.id).toMatch(/^k\d+$/);
    expect(workReasons(ctx)).toEqual([]);
    clean(state);
    const day = state.day;
    apply(state, content, { type: 'start', actionId: 'work', target: offer.id });
    expect(state.activeAction).toEqual({ actionId: 'work', endDay: day + 4, target: null, contract: offer.id });
    expect(state.contracts.current).toEqual({ ...offer, outcome: null, start: day, rolled: false });
    expect(state.contracts.offers.map((o) => o.id)).not.toContain(offer.id);
    // one contract at a time
    post(state, employer);
    expect(workReasons(ctx)).toEqual(['You already have work']);
    expect(() => apply(state, content, { type: 'start', actionId: 'work', target: offer.id })).toThrow();
    clean(state);
  });

  it('refuses an offer that is not on the board here, and an action that takes none', () => {
    const { state, employer } = game();
    const there = post(state, employer, { place: place(state, 'valmont') });
    post(state, employer);
    expect(() => apply(state, content, { type: 'start', actionId: 'work', target: there.id })).toThrow(/No offer/);
    expect(() => apply(state, content, { type: 'start', actionId: 'work' })).toThrow(/needs an offer/);
    expect(state.contracts.current).toBeNull();
  });

  it('settles work done on its last day: the pay, the outcome on the hero and the employer, a line', () => {
    const { state, ctx, hero, employer } = game();
    const offer = post(state, employer);
    const money = hero.money;
    apply(state, content, { type: 'start', actionId: 'work', target: offer.id });
    const end = state.activeAction?.endDay as number;
    runOut(state);
    expect(state.day).toBe(end);
    expect(state.contracts.current).toBeNull();
    expect(hero.money).toBe(money + 15);
    expect(lastLine(state)?.kind).toBe('contract');
    expect(text(state)).toContain('carried a letter for');
    expect(favorBetween(state, employer.id, hero.id)).toMatchObject({ strength: 'weak', until: end + 100, inherited: false });
    expect(opinionValue(ctx, employer.id, hero.id)).toBeGreaterThan(0);
  });

  it('work elsewhere is a journey there, settled on arrival', () => {
    const { state, employer, hero } = game();
    const valmont = place(state, 'valmont');
    const offer = post(state, employer, { to: valmont, days: 1 });
    const day = state.day;
    apply(state, content, { type: 'start', actionId: 'work', target: offer.id });
    // the shortest way to Valmont is 6 days; the days of the offer do not count
    expect(state.activeAction).toEqual({ actionId: 'work', endDay: day + 6, target: valmont, contract: offer.id });
    expect(position(state, content)).toMatchObject({ journey: { to: valmont, arriveDay: day + 6 } });
    const money = hero.money;
    runOut(state);
    expect(state.place.here).toBe(valmont);
    expect(state.contracts.current).toBeNull();
    expect(hero.money).toBe(money + 15);
  });

  it('an event of the contract marks a failure: no pay, the failure outcome', () => {
    const { state, ctx, hero, employer } = game();
    const offer = post(state, employer);
    apply(state, content, { type: 'start', actionId: 'work', target: offer.id });
    applyEffects(ctx, hero, { contract_outcome: 'failure' }, { hero: hero.id, protagonist: hero.id });
    expect(state.contracts.current?.outcome).toBe('failure');
    const money = hero.money;
    runOut(state);
    expect(hero.money).toBe(money);
    expect(text(state)).toContain('failed');
    expect(opinionValue(ctx, employer.id, hero.id)).toBeLessThan(0);
  });

  it('work left half done is settled at once as a failure', () => {
    const { state, hero, employer } = game();
    const offer = post(state, employer);
    apply(state, content, { type: 'start', actionId: 'work', target: offer.id });
    apply(state, content, { type: 'wait', days: 1 });
    const money = hero.money;
    apply(state, content, { type: 'start', actionId: 'wait' });
    expect(state.contracts.current).toBeNull();
    expect(state.activeAction?.contract).toBeNull();
    expect(hero.money).toBe(money);
    expect(state.chronicle.some((e) => e.kind === 'contract')).toBe(true);
    clean(state);
  });

  it('binds events to kinds of contracts and hands them the employer', () => {
    const narrated: Content = { ...content, narrator: content.narrator ? { ...content.narrator, eventChancePer10k: 10000 } : null };
    const { state, ctx, hero, employer } = game(narrated);
    const thief = findEvent(narrated, 'letter_thief');
    expect(eventWeight(ctx, thief, hero)).toBe(0);
    const guard = post(state, employer, { kind: 'guard' });
    apply(state, narrated, { type: 'start', actionId: 'work', target: guard.id });
    expect(eventWeight(ctx, thief, hero)).toBe(0);
    apply(state, narrated, { type: 'start', actionId: 'wait' });
    const letter = post(state, employer, { days: 20 });
    apply(state, narrated, { type: 'start', actionId: 'work', target: letter.id });
    expect(eventWeight(ctx, thief, hero, { employer: employer.id })).toBeGreaterThan(0);
    for (let i = 0; i < 20 && state.pendingEvent === null && state.activeAction; i++) apply(state, narrated, { type: 'wait', days: 1 });
    expect(state.pendingEvent?.eventId).toBe('letter_thief');
    expect(state.pendingEvent?.scope.employer).toBe(employer.id);
    apply(state, narrated, { type: 'choose', option: 0 });
    expect(state.contracts.current?.outcome).toBe('failure');
    clean(state, narrated);
  });

  it('conditions of the work under way, with reasons', () => {
    const { state, ctx, hero, employer } = game();
    const scope = { hero: hero.id, protagonist: hero.id };
    const report = (when: Parameters<typeof conditionReport>[2]) => conditionReport(ctx, hero, when, scope).reasons;
    expect(report({ contract_taken: true })).toEqual(['Only at work']);
    expect(report({ contract_taken: false })).toEqual([]);
    apply(state, content, { type: 'start', actionId: 'work', target: post(state, employer, { level: 2 }).id });
    expect(report({ contract_taken: true })).toEqual([]);
    expect(report({ contract_taken: false })).toEqual(['Only without work under way']);
    expect(report({ contract_kind: ['letter'] })).toEqual([]);
    expect(report({ contract_kind: ['guard'] })).toEqual(['Only at a watch over a shop']);
    expect(report({ contract_level_min: 2 })).toEqual([]);
    expect(report({ contract_level_min: 3 })).toEqual(['Only at work of level 3 or higher']);
    // only the hero takes work: for anyone else it is unmet and hidden
    expect(conditionReport(ctx, employer, { contract_taken: true }, scope)).toMatchObject({ met: false, hidden: true });
  });

  it('death: a dead employer takes his offers off the boards; the hero leaves no work to his heir', () => {
    const { state, ctx, hero, employer } = game();
    post(state, employer);
    expect(contractsRefs(ctx)).toEqual([employer.id]);
    expect(hotRefs(ctx).has(employer.id)).toBe(true);
    kill(ctx, employer, 'illness');
    expect(state.contracts.offers).toEqual([]);
    const other = findCharacter(state, state.circle[0] as string) as Character;
    apply(state, content, { type: 'start', actionId: 'work', target: post(state, other).id });
    kill(ctx, hero, 'illness');
    expect(state.contracts.current).toBeNull();
  });

  it('the bot takes an offer of the board for a contract action', () => {
    const { state, employer } = game();
    const offer = post(state, employer);
    const onlyWork: Content = { ...content, actions: content.actions.filter((a) => a.id === 'work' || a.id === 'wait') };
    let seen = false;
    for (let seed = 1; seed < 30 && !seen; seed++) {
      const cmd = botCommand(state, onlyWork, seedRng(seed));
      if (cmd.type === 'start' && cmd.actionId === 'work') {
        expect(cmd.target).toBe(offer.id);
        seen = true;
      }
    }
    expect(seen).toBe(true);
  });
});

describe('CK.2a: favors', () => {
  it('a weak favor is called in once within its term; a strong one rests', () => {
    const { state, ctx, hero, employer } = game();
    const scope = { hero: hero.id, protagonist: hero.id, target: employer.id };
    expect(conditionReport(ctx, hero, { favor_with: 'target' }, scope).reasons).toEqual([`${name(employer)} owes you no favor`]);
    grantFavor(state, content, employer.id, hero.id, 'weak');
    expect(conditionReport(ctx, hero, { favor_with: 'target' }, scope).met).toBe(true);
    expect(conditionReport(ctx, hero, { favor_with: { role: 'target', strength: 'strong' } }, scope).reasons).toEqual([`${name(employer)} owes you no strong favor`]);
    expect(favorsRefs(ctx)).toEqual([employer.id, hero.id]);
    clean(state);
    apply(state, content, { type: 'interact', id: 'call_in', target: employer.id });
    expect(favorBetween(state, employer.id, hero.id)).toBeNull();
    grantFavor(state, content, employer.id, hero.id, 'strong');
    applyEffects(ctx, hero, { favor_use: 'target' }, scope);
    expect(favorBetween(state, employer.id, hero.id)).toMatchObject({ strength: 'strong', used: state.day });
    expect(conditionReport(ctx, hero, { favor_with: 'target' }, scope).met).toBe(false);
    clean(state);
  });

  it('a weak favor lapses after its term', () => {
    const { state, ctx, hero, employer } = game();
    grantFavor(state, content, employer.id, hero.id, 'weak');
    state.day += 101;
    expect(conditionReport(ctx, hero, { favor_with: 'target' }, { hero: hero.id, protagonist: hero.id, target: employer.id }).met).toBe(false);
  });

  it('the heir takes the favors of the dead head, held and owed, as weak ones, once; a dead debtor owes nothing', () => {
    const { state, ctx, hero, employer } = game();
    const [debtor, friend, lender, heir, next] = [1, 2, 3, 4, 5].map((i) => findCharacter(state, state.circle[i] as string) as Character) as [Character, Character, Character, Character, Character];
    grantFavor(state, content, employer.id, hero.id, 'strong');
    grantFavor(state, content, debtor.id, hero.id, 'weak');
    grantFavor(state, content, friend.id, hero.id, 'weak');
    grantFavor(state, content, hero.id, lender.id, 'weak');
    kill(ctx, debtor, 'illness');
    expect(favorBetween(state, debtor.id, hero.id)).toBeNull();
    state.day += 70;
    favorsOnSuccession(ctx, hero, heir);
    // a strong favor passes as a weak one with the full term; a weak one keeps its term, at most 40 days more
    expect(favorBetween(state, employer.id, heir.id)).toMatchObject({ strength: 'weak', until: state.day + 100, inherited: true });
    expect(favorBetween(state, friend.id, heir.id)).toMatchObject({ strength: 'weak', until: state.day + 30, inherited: true });
    expect(favorBetween(state, heir.id, lender.id)).toMatchObject({ strength: 'weak', until: state.day + 30, inherited: true });
    expect(state.favors.some((f) => f.from === hero.id || f.to === hero.id)).toBe(false);
    clean(state);
    favorsOnSuccession(ctx, heir, next);
    expect(state.favors).toEqual([]);
  });
});

describe('CK.2a: interactions', () => {
  it('aims an interaction at a person near the hero: effects on both, a cooldown with its reason, no time passes', () => {
    const { state, ctx, hero, employer } = game();
    const day = state.day;
    expect(interactionAvailability(ctx, employer.id).map((a) => [a.interaction.id, a.unmet])).toEqual([
      ['call_in', [`${name(employer)} owes you no favor`]],
      ['chat', []],
    ]);
    apply(state, content, { type: 'interact', id: 'chat', target: employer.id });
    expect(state.day).toBe(day);
    expect(opinionValue(ctx, employer.id, hero.id)).toBeGreaterThan(0);
    expect(state.interactions.recent).toEqual([{ id: 'chat', target: employer.id, day }]);
    expect(hotRefs(ctx).has(employer.id)).toBe(true);
    expect(interactionAvailability(ctx, employer.id).find((a) => a.interaction.id === 'chat')?.unmet).toEqual(['You did this lately']);
    expect(() => apply(state, content, { type: 'interact', id: 'chat', target: employer.id })).toThrow(/not available/);
    expect(() => apply(state, content, { type: 'interact', id: 'chat', target: hero.id })).toThrow(/Nobody near/);
    expect(() => apply(state, content, { type: 'interact', id: 'nope', target: employer.id })).toThrow(/Unknown interaction/);
    clean(state);
  });
});

describe('CK.2a: content checks', () => {
  const errors = (yaml: string, files = FILES) => {
    const result = loadContent([...files, { path: 'tests/extra.yaml', text: yaml }]);
    return result.ok ? [] : result.errors.map((e) => e.message);
  };
  const withoutContracts = FILES.filter((f) => !f.path.includes('fixtures/contracts'));

  it('accepts the fixture', () => {
    expect(loadContent(FILES).ok).toBe(true);
  });

  it('keys of contracts and favors need their top-level keys', () => {
    expect(errors('actions:\n  - { id: w2, name: W, category: livelihood, duration: { min: 1, max: 1 }, target: contract, text: "{name} worked." }', withoutContracts)).toContain('contracts need the top-level key "contracts"');
    expect(errors('events:\n  - { id: e2, weight: 1, text: T, effects: { favor_use: hero } }', withoutContracts)).toContain('favors need the top-level key "favors"');
  });

  it('an event of a contract names known kinds and gets only its employer', () => {
    expect(errors('events:\n  - { id: e2, weight: 1, contract: [ferry], text: T }')).toContain('unknown kind of contract "ferry"');
    expect(errors('events:\n  - { id: e2, weight: 1, contract: [letter], roles: { friend: { pick: given } }, text: T }')).toContain('an event of a contract is handed over only its employer (role "employer")');
    expect(errors('actions:\n  - { id: w2, name: W, category: livelihood, duration: { min: 1, max: 1 }, target: contract, until: { when: { contract_taken: false } }, text: "{name} worked." }')).toContain(
      'an action that serves a contract ends with its work, not by a goal',
    );
  });

  it('interactions name only their roles', () => {
    const yaml = 'interactions:\n  list: [{ id: x, name: X, effects: { favor_use: friend } }]\n  reasons: { cooldown: Lately }';
    const files = FILES.map((f) => (f.path.includes('fixtures/contracts') ? { ...f, text: f.text.replace(/interactions:[\s\S]*?(?=\nactions:)/, '') } : f));
    expect(errors(yaml, files)).toContain('unknown role "friend": an interaction knows hero, protagonist, target');
  });
});

const name = (c: Character): string => fullName(c);
