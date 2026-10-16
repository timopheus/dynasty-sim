import { describe, expect, it, vi } from 'vitest';
import { botCommand } from '../src/core/bot';
import { entryText } from '../src/core/chronicle/log';
import type { Content } from '../src/core/content/schema';
import { chanceBand, checkChance, rollCheck } from '../src/core/events/checks';
import type { EventDef } from '../src/core/events/content';
import { eventWeight, findEvent, fireEvent, startEvent } from '../src/core/events/events';
import { eventView } from '../src/core/events/view';
import { apply, newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { createCharacter } from '../src/core/lifecycle';
import { acquaintanceLevel } from '../src/core/relations/acquaintance';
import { seedRng } from '../src/core/rng';
import { runSim } from '../src/core/sim';
import { deserialize, serialize } from '../src/core/save/save';
import type { Character, Ctx } from '../src/core/state';
import { BASE_FILES, fixtureNarrator, loadOrThrow } from './fixtures/content';
import { readContentFiles } from '../tools/content-files';

// A condition the hero cannot know about (a secret, 3.5/3.6): no such key exists yet, so the test adds one.
vi.mock('../src/core/roles/conditions', async (original) => {
  const actual = await original<typeof import('../src/core/roles/conditions')>();
  return {
    ...actual,
    checkRolesConditions: (...args: Parameters<typeof actual.checkRolesConditions>) =>
      (args[2] as { secret_test?: boolean }).secret_test ? [{ text: 'Knows a secret', hidden: true }] : actual.checkRolesConditions(...args),
  };
});

const content: Content = loadOrThrow([
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions'),
  ...readContentFiles('tests/fixtures/events'),
]);

/** A new game whose hero has fixed stats, no traits and a circle with the given money; no action, no time runs. */
function game(money: number[] = [5, 100, 200], c: Content = content): { ctx: Ctx; hero: Character; people: Character[] } {
  const state = newGame(1, c);
  const ctx = { state, content: c };
  const hero = getPlayer(state);
  hero.traits = [];
  hero.baseStats = { diplomacy: 5, martial: 5, stewardship: 5, intrigue: 5, learning: 5, prowess: 5 };
  const people = money.map((m) => {
    const p = createCharacter(ctx, { surname: 'Circle', age: { min: 30, max: 30 } });
    p.money = m;
    p.occupation = 'porter';
    p.traits = [];
    p.baseStats = { diplomacy: 5, martial: 5, stewardship: 5, intrigue: 5, learning: 5, prowess: 5 };
    state.circle.push(p.id);
    return p;
  });
  return { ctx, hero, people };
}

/** The fixture events are `followup_only` to stay out of the deck; tests that roll the deck (3.7) put them in. */
function inDeck(event: EventDef): EventDef {
  const { followup_only: _out, ...rest } = event;
  return rest;
}

function fire(ctx: Ctx, id: string, hero: Character) {
  return fireEvent(ctx, findEvent(ctx.content, id), hero);
}

const lastLine = (ctx: Ctx) => ctx.state.chronicle.at(-1)!;

describe('options', () => {
  it('shows an unmet option grey with its reason, and leaves out a hidden one', () => {
    const { ctx, hero } = game();
    const secret: EventDef = {
      ...findEvent(content, 'choices'),
      id: 'secret',
      options: [
        ...findEvent(content, 'choices').options!,
        { text: 'Use what you know', when: { secret_test: true } as never, result: '{name} used a secret.' },
      ],
    };
    const c = { ...content, events: [...content.events, secret] };
    const cctx = { state: ctx.state, content: c };
    fireEvent(cctx, secret, hero);
    const view = eventView(cctx)!;
    expect(view.options.map((o) => o.index)).toEqual([0, 1, 2]); // option 3 is hidden
    expect(view.options[1]).toMatchObject({ available: false, reasons: ['Requires 1000 crowns'] });
    expect(view.options[0]).toMatchObject({ available: true, reasons: [], chance: null });
    expect(() => apply(ctx.state, c, { type: 'choose', option: 1 })).toThrow(/not available/);
    expect(() => apply(ctx.state, c, { type: 'choose', option: 3 })).toThrow(/not available/);
  });

  it('lets the bot choose only available options', () => {
    const { ctx, hero } = game();
    fire(ctx, 'choices', hero);
    const rng = seedRng(5, 1);
    for (let i = 0; i < 200; i++) {
      const cmd = botCommand(ctx.state, content, rng);
      expect(cmd).not.toEqual({ type: 'choose', option: 1 });
    }
  });
});

describe('checks (D-042)', () => {
  const choices = findEvent(content, 'choices');
  const check = choices.options![2]!.check!;

  it('gives 50% and 5% a point, within 5–95%, with bonuses', () => {
    const { ctx, hero } = game();
    const scope = { hero: hero.id, protagonist: hero.id };
    expect(checkChance(ctx, check, hero, scope)).toBe(25); // 5 against 10
    hero.money = 50;
    expect(checkChance(ctx, check, hero, scope)).toBe(45); // +4 with money
    hero.baseStats.prowess = 0;
    hero.money = 0;
    expect(checkChance(ctx, check, hero, scope)).toBe(5); // 0 - 10: 0%, held at 5
    hero.baseStats.prowess = 30;
    expect(checkChance(ctx, check, hero, scope)).toBe(95);
    expect([5, 25, 50, 75, 95].map(chanceBand)).toEqual(['hopeless', 'risky', 'even', 'likely', 'certain']);
  });

  it('rolls exact outcomes at 5% and 95% from the world stream', () => {
    const { ctx, hero } = game();
    const scope = { hero: hero.id, protagonist: hero.id };
    const count = () => {
      ctx.state.rng = seedRng(42);
      let wins = 0;
      for (let i = 0; i < 1000; i++) if (rollCheck(ctx, check, hero, scope)) wins++;
      return wins;
    };
    hero.baseStats.prowess = 0;
    const low = count();
    hero.baseStats.prowess = 30;
    const high = count();
    expect([low, high]).toEqual([47, 957]);
  });

  it('opposes a stat of a role and applies the outcome to the role', () => {
    const { ctx, hero, people } = game([5, 100, 30]);
    const rival = people[1]!; // the first with 50 crowns or more
    rival.baseStats.prowess = 0;
    hero.baseStats.prowess = 30; // 95%
    ctx.state.rng = seedRng(3);
    fire(ctx, 'duel', hero);
    expect(ctx.state.pendingEvent!.scope.rival).toBe(rival.id);
    expect(eventView(ctx)!.options[0]!.chance).toEqual({ percent: 95, band: 'certain' });
    rival.baseStats.prowess = 30;
    expect(eventView(ctx)!.options[0]!.chance).toEqual({ percent: 50, band: 'even' });
    rival.baseStats.prowess = 0;
    apply(ctx.state, content, { type: 'choose', option: 0 });
    expect(entryText(lastLine(ctx))).toBe(`${hero.givenName} ${hero.surname} beat ${rival.givenName} ${rival.surname} in a duel.`);
    expect(rival.money).toBe(95);
  });

  it('makes the participants known to the hero', () => {
    const { ctx, hero, people } = game();
    expect(acquaintanceLevel(ctx.state, content, hero.id, people[1]!.id)).toBeNull();
    fire(ctx, 'duel', hero);
    expect(acquaintanceLevel(ctx.state, content, hero.id, people[1]!.id)).toBe('known');
  });
});

describe('pages', () => {
  it('glues the lines of two pages into one entry, with the money of both', () => {
    const { ctx, hero, people } = game([5]);
    const before = ctx.state.chronicle.length;
    fire(ctx, 'two_pages', hero);
    apply(ctx.state, content, { type: 'choose', option: 0 });
    expect(ctx.state.pendingEvent).toMatchObject({ page: 'talk' });
    expect(ctx.state.chronicle.length).toBe(before);
    expect(eventView(ctx)!.text).toEqual([{ id: people[0]!.id, name: `${people[0]!.givenName} Circle` }, ' talks of old times.']);
    apply(ctx.state, content, { type: 'choose', option: 0 });
    expect(ctx.state.pendingEvent).toBeNull();
    expect(ctx.state.chronicle.length).toBe(before + 1);
    const name = `${hero.givenName} ${hero.surname}`;
    const friend = `${people[0]!.givenName} Circle`;
    const his = people[0]!.sex === 'male' ? 'his' : 'her';
    expect(entryText(lastLine(ctx))).toBe(`${name} met ${friend}. ${name} listened to ${his} stories.`);
    expect(lastLine(ctx).kind).toBe('event');
    expect(hero.money).toBe(15);
  });

  it('shows a page without options with Continue, and ends the event there', () => {
    const { ctx, hero } = game();
    fire(ctx, 'two_pages', hero);
    apply(ctx.state, content, { type: 'choose', option: 0 });
    apply(ctx.state, content, { type: 'choose', option: 1 });
    expect(eventView(ctx)!.options).toEqual([{ index: 0, text: null, available: true, reasons: [], chance: null }]);
    expect(() => apply(ctx.state, content, { type: 'choose', option: 1 })).toThrow();
    apply(ctx.state, content, { type: 'choose', option: 0 });
    expect(entryText(lastLine(ctx))).toMatch(/met .* left early\.$/);
  });

  it('continues the same page after a save in the middle of the second page', () => {
    const { ctx, hero } = game();
    fire(ctx, 'two_pages', hero);
    apply(ctx.state, content, { type: 'choose', option: 0 });
    const loaded = deserialize(serialize(ctx.state), content);
    expect(loaded.pendingEvent).toEqual(ctx.state.pendingEvent);
    apply(ctx.state, content, { type: 'choose', option: 0 });
    apply(loaded, content, { type: 'choose', option: 0 });
    expect(loaded).toEqual(ctx.state);
    expect(checkInvariants(loaded, content)).toEqual([]);
  });

  it('puts ▸ on a choice that starts a relation (D-040)', () => {
    const { ctx, hero } = game();
    const base = findEvent(content, 'duel');
    // The `relation` effect arrives with 3.6; the engine looks only at the key.
    const rel: EventDef = { ...base, id: 'befriend', options: [{ text: 'Befriend {rival}', on: { rival: { relation: [{ start: 'friend', with: 'hero' }] } as never }, result: '{name} befriended {rival}.' }] };
    const c = { ...content, events: [...content.events, rel] };
    const cctx = { state: ctx.state, content: c };
    fireEvent(cctx, rel, hero);
    apply(ctx.state, c, { type: 'choose', option: 0 });
    expect(lastLine(ctx)).toMatchObject({ kind: 'event', level: 'chronicle', mark: true });
    fireEvent(cctx, base, hero);
    apply(ctx.state, c, { type: 'choose', option: 1 });
    expect(lastLine(ctx).mark).toBeUndefined();
  });
});

describe('notices', () => {
  it('stops time for a notice with a chronicle line, until Continue', () => {
    const { ctx, hero } = game();
    expect(startEvent(ctx, findEvent(content, 'loud_notice'), hero)).toBe(true);
    expect(ctx.state.status).toBe('awaiting_choice');
    expect(eventView(ctx)!.options).toHaveLength(1);
    expect(hero.money).toBe(10);
    apply(ctx.state, content, { type: 'choose', option: 0 });
    expect(hero.money).toBe(13);
    expect(lastLine(ctx)).toMatchObject({ kind: 'notice', level: 'chronicle' });
  });

  it('in the day loop: a loud notice stops the action, a quiet one does not', () => {
    for (const [id, stops] of [['loud_notice', true], ['quiet_notice', false]] as const) {
      const c = fixtureNarrator({ eventChancePer10k: 10000, minDaysBetweenEvents: 1 }, { events: [inDeck(findEvent(content, id))] });
      const state = newGame(1, c);
      apply(state, c, { type: 'start', actionId: 'wait' });
      expect(state.status === 'awaiting_choice', id).toBe(stops);
      expect(state.day < 30, id).toBe(stops);
      expect(checkInvariants(state, c)).toEqual([]);
    }
  });

  it('carries out a notice without a chronicle line at once, to the journal', () => {
    const { ctx, hero } = game();
    const before = hero.money;
    expect(fire(ctx, 'quiet_notice', hero)).toBe('done');
    expect(ctx.state.pendingEvent).toBeNull();
    expect(hero.money).toBe(before + 1);
    expect(lastLine(ctx)).toMatchObject({ kind: 'notice', level: 'journal' });
  });
});

describe('weight', () => {
  it('multiplies by integer fractions and rounds down once', () => {
    const { ctx, hero, people } = game([5, 100]);
    const event = findEvent(content, 'weighted');
    const rng = [...ctx.state.rng];
    expect(eventWeight(ctx, event, hero)).toBe(2); // 5 × 1/2
    people[1]!.money = 150; // a patron with 150 crowns: × 3
    expect(eventWeight(ctx, event, hero)).toBe(7); // 5 × 1/2 × 3 = 7.5
    hero.money = 500;
    expect(eventWeight(ctx, event, hero)).toBe(15);
    expect(ctx.state.rng).toEqual(rng);
  });

  it('is 0 when `when` of the event is not met or a role cannot be filled', () => {
    const { ctx, hero } = game([5]);
    expect(eventWeight(ctx, findEvent(content, 'duel'), hero)).toBe(0);
    const poor: EventDef = { ...findEvent(content, 'choices'), when: { money_min: 1000 } };
    expect(eventWeight(ctx, poor, hero)).toBe(0);
  });
});

describe('in a run', () => {
  it('plays the engine events for 20 years with the bot without broken invariants', () => {
    const c: Content = { ...content, events: content.events.map(inDeck), narrator: { ...content.narrator!, eventChancePer10k: 3000, minDaysBetweenEvents: 1 } };
    const { state, violations } = runSim(c, { seed: 3, years: 20 });
    expect(violations).toEqual([]);
    const kinds = new Set(state.chronicle.map((e) => e.kind));
    expect(kinds.has('event') && kinds.has('notice')).toBe(true);
    expect(state.chronicle.some((e) => / met .*\. /.test(entryText(e)))).toBe(true); // two pages, one entry
  });
});

describe('wave 2 together: roles (3.3), texts (3.4) and the engine (3.2)', () => {
  /** One brawl from a fresh game: the role, the chance, the screen text and the line it ends with. */
  function brawl(seed: number) {
    const { ctx, hero, people } = game([200, 60, 300, 10]);
    people[3]!.occupation = 'elder'; // never a bully: wrong occupation
    ctx.state.rng = seedRng(seed);
    expect(fire(ctx, 'tavern_brawl', hero)).toBe('waiting');
    const { scope } = ctx.state.pendingEvent!;
    const view = eventView(ctx)!;
    const bully = people.find((p) => p.id === scope.bully)!;
    apply(ctx.state, content, { type: 'choose', option: 0 });
    return { ctx, hero, people, scope, view, bully, line: lastLine(ctx) };
  }

  it('passes whole: picked role, opposed check, grammar and optional role in the texts, effect on the role', () => {
    const { ctx, hero, people, scope, view, bully, line } = brawl(11);
    expect([people[0]!.id, people[1]!.id, people[2]!.id]).toContain(scope.bully);
    expect(scope.witness).not.toBe(scope.bully);
    expect(acquaintanceLevel(ctx.state, content, hero.id, bully.id)).toBe('known');
    const shown = entryText({ ...line, parts: view.text });
    expect(shown).toMatch(/ shoves you in (a smoky tavern|a crowded inn)\.( .+ looks on\.)?$/);
    expect(view.text[0]).toEqual({ id: bully.id, name: `${bully.givenName} ${bully.surname}` });
    expect(view.options[0]!.chance).toEqual({ percent: 50, band: 'even' }); // 5 against 5
    const text = entryText(line);
    expect(text).toMatch(/^\S+ \S+ (knocked down|was beaten by) \S+ \S+ in (a smoky tavern|a crowded inn)\.$/);
    const before = [200, 60, 300][people.indexOf(bully)]!;
    expect(bully.money).toBe(text.includes('knocked down') ? before - 7 : before);
    expect(line.parts).toContainEqual({ id: bully.id, name: `${bully.givenName} ${bully.surname}` });
    expect(checkInvariants(ctx.state, content)).toEqual([]);
  });

  it('reads the same for the same seed, and the rich are preferred', () => {
    const a = brawl(5);
    const b = brawl(5);
    expect(entryText(a.line)).toBe(entryText(b.line));
    expect(a.view).toEqual(b.view);
    let rich = 0;
    for (let seed = 1; seed <= 200; seed++) if (brawl(seed).bully.money >= 150 - 7) rich++;
    expect(rich).toBeGreaterThan(150); // ×5 for 200 and 300 against 60: about 10 of 11
  });
});
