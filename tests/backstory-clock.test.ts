import { describe, expect, it } from 'vitest';
import { allChronicle } from '../src/core/archive/archive';
import { backstoryAfterChoice, EARLY_YEARS } from '../src/core/backstory/phases';
import { START_AGE_MAX, START_AGE_MIN } from '../src/core/backstory/content';
import { shiftYears } from '../src/core/backstory/effects';
import { botCommand } from '../src/core/bot';
import { availableActions } from '../src/core/actions/actions';
import type { Content } from '../src/core/content/schema';
import { apply, newGame, play } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { checkInvariants } from '../src/core/invariants';
import { seedRng } from '../src/core/rng';
import { deserialize, serialize } from '../src/core/save/save';
import { runSim } from '../src/core/sim';
import type { GameState } from '../src/core/state';
import { ageYears } from '../src/core/time/calendar';
import { readContentFiles } from '../tools/content-files';
import { BASE_FILES, loadOrThrow, realContent } from './fixtures/content';

/**
 * One clock (D-479, T.1): the backstory with `fromBirth` on, over the base, population and opinions fixtures. Nobody
 * dies of old age or illness here, so the scenes and dates are tested apart from deaths; the founder's childhood with
 * deaths all around (D-480, D-481, T.3) is tested below on `deadly`.
 */
const loaded: Content = loadOrThrow([
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions'),
  ...readContentFiles('tests/fixtures/backstory-clock'),
]);
const content: Content = { ...loaded, health: { ...loaded.health, mortality: [{ per100k: 0, cause: 'illness' }] } };
const stages = content.backstory!.stages;

interface Seen {
  eventId: string;
  stage: string;
  day: number;
  age: number;
}

interface Run {
  state: GameState;
  scenes: Seen[];
  /** The day each line was written on, as it stood right after the command that wrote it. */
  written: number[];
  /** The day the line "went out into the world" was written. */
  outDay: number;
  violations: string[];
}

/**
 * Plays the backstory one day at a time with the random bot, checking after every command that each new line is dated
 * the day it is written on and that no line written before has moved.
 */
function liveChildhood(seed: number): Run {
  const state = newGame(seed, content);
  const bot = seedRng(seed, 99);
  const scenes: Seen[] = [];
  const written: number[] = [];
  const violations: string[] = [];
  const record = (): void => {
    const lines = allChronicle(state);
    for (let i = written.length; i < lines.length; i++) {
      const day = lines[i]!.day;
      if (day !== state.day) violations.push(`line ${i} "${lines[i]!.kind}" is dated ${day}, written on ${state.day}`);
      written.push(day);
    }
    written.forEach((d, i) => {
      if (lines[i]!.day !== d) violations.push(`line ${i} moved from ${d} to ${lines[i]!.day}`);
    });
  };
  const see = (): void => {
    const p = state.pendingEvent;
    const event = p && content.events.find((e) => e.id === p.eventId);
    if (!event || event.deck !== 'backstory' || scenes.at(-1)?.eventId === event.id) return;
    scenes.push({ eventId: event.id, stage: event.stage!, day: state.day, age: ageYears(getPlayer(state).birthDay, state.day) });
  };
  record();
  see();
  let guard = 0;
  while (state.backstory.running) {
    if (++guard > 20000) throw new Error('the backstory does not end');
    const cmd = state.status === 'running' ? { type: 'wait' as const, days: 1 } : botCommand(state, content, bot);
    apply(state, content, cmd);
    record();
    see();
    violations.push(...checkInvariants(state, content));
  }
  const out = allChronicle(state).find((e) => e.kind === 'backstory_end');
  return { state, scenes, written, outDay: out?.day ?? -1, violations };
}

const runs = Array.from({ length: 10 }, (_, i) => liveChildhood(i + 1));

describe('the backstory on one clock (D-479)', () => {
  it('starts with the founder born on day 0, waiting in the hidden action for the first scene', () => {
    const state = newGame(1, content);
    const hero = getPlayer(state);
    expect(hero.birthDay).toBe(0);
    expect(state.day).toBe(0);
    expect(state.backstory.running).toBe(true);
    expect(state.backstory.lines).toEqual([]);
    if (state.pendingEvent === null) {
      expect(state.status).toBe('running');
      expect(state.activeAction?.actionId).toBe(EARLY_YEARS);
      expect(state.activeAction?.endDay).toBe(state.backstory.next);
    }
    // nobody may start the action of the early years
    expect(availableActions({ state, content }).map((a) => a.id)).not.toContain(EARLY_YEARS);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it.each(runs.map((r, i) => [i + 1, r] as const))('seed %i: each scene comes when the founder is of the age of its stage', (_seed, run) => {
    expect(run.violations).toEqual([]);
    const stageOf = (id: string) => stages.findIndex((s) => s.id === id);
    let lastDay = 0;
    let lastAge = 0;
    for (const scene of run.scenes) {
      const age = stages[stageOf(scene.stage)]!.age;
      if (age !== undefined) expect(scene.age, `${scene.eventId} on day ${scene.day}`).toBe(age);
      expect(scene.day).toBeGreaterThanOrEqual(lastDay);
      expect(scene.age).toBeGreaterThanOrEqual(lastAge);
      lastDay = scene.day;
      lastAge = scene.age;
    }
    // every stage has its scenes, the youth two of them, and its date is the day of its first scene
    expect(run.scenes.map((s) => s.stage)).toEqual(['origin', 'childhood', 'youth', 'youth', 'training', 'leaving']);
    const firsts = run.scenes.filter((s, i) => i === 0 || run.scenes[i - 1]!.stage !== s.stage).map((s) => s.day);
    expect(run.state.backstory.dates).toEqual(firsts);
  });

  it.each(runs.map((r, i) => [i + 1, r] as const))('seed %i: lines are dated the day they are written and never fall', (_seed, run) => {
    const days = allChronicle(run.state).map((e) => e.day);
    expect(days).toEqual(run.written);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    // the founder's first line is his birth, on day 0; the scenes write theirs years later
    expect(days[0]).toBe(0);
    expect(days.at(-1)).toBeGreaterThan(shiftYears(0, 15));
  });

  it.each(runs.map((r, i) => [i + 1, r] as const))('seed %i: goes out into the world at 16-21, on a living day, after the years of study', (_seed, run) => {
    const { state } = run;
    const hero = getPlayer(state);
    const age = ageYears(hero.birthDay, run.outDay);
    expect(age).toBeGreaterThanOrEqual(START_AGE_MIN);
    expect(age).toBeLessThanOrEqual(START_AGE_MAX);
    expect(hero.birthDay).toBe(0);
    expect(run.outDay).toBe(state.day);
    expect(run.outDay).toBeGreaterThanOrEqual(state.backstory.notBefore);
    expect(state.status).toBe('awaiting_action');
    expect(state.activeAction).toBeNull();
    expect(state.backstory.next).toBeNull();
    const out = state.chronicle.at(-1)!;
    expect(out.kind).toBe('backstory_end');
  });

  it('lets the years of study pass in living time: the next scene waits for them', () => {
    let seen = 0;
    for (const run of runs) {
      const training = run.scenes.find((s) => s.stage === 'training')!;
      const leaving = run.scenes.find((s) => s.stage === 'leaving')!;
      const years = ageYears(training.day, leaving.day);
      expect(years).toBeLessThanOrEqual(2);
      if (years > 0) seen += 1;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('dates no line afterwards: the old re-dating is not run on the clock', () => {
    for (const run of runs) {
      expect(run.state.backstory.lines).toEqual([]);
      // the scene lines carry the days of the scenes, not the birthdays of the stages
      const birthdays = new Set(stages.flatMap((s) => (s.age === undefined ? [] : [shiftYears(0, s.age)])));
      const sceneDays = run.scenes.map((s) => s.day);
      const lines = allChronicle(run.state).filter((e) => e.kind !== 'start' && e.kind !== 'backstory_end' && e.subject === run.state.playerId && e.level === 'chronicle');
      for (const line of lines) expect(sceneDays.includes(line.day) || !birthdays.has(line.day)).toBe(true);
    }
  });

  it('never replaces an occupation of the founder\'s own; the scene still comes on its day', () => {
    const state = newGame(4, content);
    const bot = seedRng(4, 7);
    // to the wait before the childhood scene
    let guard = 0;
    while (state.backstory.played.length < 1 || state.status !== 'running') {
      if (++guard > 5000) throw new Error('no wait before the childhood scene');
      apply(state, content, state.status === 'running' ? { type: 'wait', days: 1 } : botCommand(state, content, bot));
    }
    const next = state.backstory.next!;
    expect(next).toBeGreaterThan(state.day);
    // an illness broke off the early years, and the child rests: a choice in some event must not undo it
    state.activeAction = { actionId: 'rest', endDay: next + 30, target: null, contract: null };
    backstoryAfterChoice({ state, content });
    expect(state.activeAction.actionId).toBe('rest');
    while (state.day < next && state.status === 'running') apply(state, content, { type: 'wait', days: 1 });
    expect(state.day).toBe(next);
    expect(state.pendingEvent?.eventId).toMatch(/^childhood_/);
    expect(state.activeAction?.actionId).toBe('rest');
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('lets an occupation of his own that ends on the day of the scene end first; the early years resume by themselves and the scene comes the next day (T.3)', () => {
    const state = newGame(4, content);
    const bot = seedRng(4, 7);
    let guard = 0;
    while (state.backstory.played.length < 1 || state.status !== 'running') {
      if (++guard > 5000) throw new Error('no wait before the childhood scene');
      apply(state, content, state.status === 'running' ? { type: 'wait', days: 1 } : botCommand(state, content, bot));
    }
    const next = state.backstory.next!;
    state.activeAction = { actionId: 'rest', endDay: next, target: null, contract: null };
    while (state.day < next) {
      apply(state, content, { type: 'wait', days: 1 });
      expect(checkInvariants(state, content)).toEqual([]);
    }
    // the rest ended on its day; the child is never asked for an occupation: the early years go on until tomorrow
    expect(state.day).toBe(next);
    expect(state.status).toBe('running');
    expect(state.activeAction?.actionId).toBe(EARLY_YEARS);
    expect(state.backstory.next).toBe(next);
    expect(availableActions({ state, content })).toEqual([]);
    apply(state, content, { type: 'wait', days: 1 });
    expect(state.day).toBe(next + 1);
    expect(state.pendingEvent?.eventId).toMatch(/^childhood_/);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('play() and the bot live through the childhood by themselves; the run keeps its invariants', () => {
    const state = newGame(5, content);
    const bot = seedRng(5, 7);
    let steps = 0;
    if (state.status === 'running') play(state, content, { type: 'wait', days: 1 });
    while (state.backstory.running && steps++ < 50) play(state, content, botCommand(state, content, bot));
    expect(state.backstory.running).toBe(false);
    expect(ageYears(getPlayer(state).birthDay, state.day)).toBeGreaterThanOrEqual(START_AGE_MIN);
    for (let seed = 1; seed <= 3; seed++) {
      const sim = runSim(content, { seed, years: 25 });
      expect(sim.violations).toEqual([]);
      expect(sim.state.chronicle.some((e) => e.kind === 'backstory_end')).toBe(true);
    }
  });

  it('a game saved in the childhood loads and goes on the same', () => {
    const a = newGame(2, content);
    const b = newGame(2, content);
    const botA = seedRng(2, 7);
    const botB = seedRng(2, 7);
    for (let i = 0; i < 3; i++) {
      play(a, content, botCommand(a, content, botA));
      play(b, content, botCommand(b, content, botB));
    }
    const c = deserialize(serialize(b), content);
    while (a.backstory.running) {
      play(a, content, botCommand(a, content, botA));
      play(c, content, botCommand(c, content, botB));
    }
    expect(allChronicle(c)).toEqual(allChronicle(a));
    expect(c.day).toBe(a.day);
  });

  it('keeps the old way in the real content until T.4: fromBirth is off', () => {
    expect(realContent().backstory?.fromBirth).not.toBe(true);
  });
});

/**
 * The same fixture with families (the founder has parents) where a year kills three people in ten: without D-480 the
 * founder would hardly live to sixteen, and some parents die before their fate.
 */
const withFamily: Content = loadOrThrow([
  ...BASE_FILES,
  ...readContentFiles('tests/fixtures/population'),
  ...readContentFiles('tests/fixtures/opinions'),
  ...readContentFiles('tests/fixtures/family'),
  ...readContentFiles('tests/fixtures/backstory-clock'),
]);
const deadly: Content = { ...withFamily, health: { ...withFamily.health, mortality: [{ per100k: 30000, cause: 'illness' }] } };

interface Childhood {
  state: GameState;
  /** Parents alive at the birth. */
  parents: string[];
  /** The money the scenes gave or took: the sum of the changes made by choices. */
  fromScenes: number;
  problems: string[];
}

/**
 * Lives through the childhood one day at a time with the random bot and checks after every command what the founder
 * gets meanwhile (T.3): only the scenes, only the early years, no occupation to start, no board, no money but the scenes'.
 */
function childhood(seed: number, from: Content): Childhood {
  const state = newGame(seed, from);
  const bot = seedRng(seed, 99);
  const founder = getPlayer(state);
  const parents = [founder.father, founder.mother].filter((id): id is string => id !== null && state.characters.some((c) => c.id === id && c.deathDay === null));
  const problems: string[] = [];
  let fromScenes = 0;
  let guard = 0;
  while (state.backstory.running) {
    if (++guard > 20000) throw new Error('the backstory does not end');
    const cmd = state.status === 'running' ? { type: 'wait' as const, days: 1 } : botCommand(state, from, bot);
    const before = founder.money;
    apply(state, from, cmd);
    if (cmd.type === 'choose') fromScenes += founder.money - before;
    else if (founder.money !== before) problems.push(`day ${state.day}: money moved from ${before} to ${founder.money} outside a scene`);
    if (founder.deathDay !== null) problems.push(`day ${state.day}: the founder died`);
    if (!state.backstory.running) break;
    const p = state.pendingEvent;
    const event = p && from.events.find((e) => e.id === p.eventId);
    if (p && event?.deck !== 'backstory') problems.push(`day ${state.day}: event ${p.eventId} is not a scene`);
    if (state.activeAction && state.activeAction.actionId !== EARLY_YEARS) problems.push(`day ${state.day}: occupation ${state.activeAction.actionId}`);
    if (availableActions({ state, content: from }).length > 0) problems.push(`day ${state.day}: an occupation is open to the child`);
    if (state.contracts.offers.length > 0) problems.push(`day ${state.day}: work on a board`);
    problems.push(...checkInvariants(state, from));
  }
  return { state, parents, fromScenes, problems };
}

const childhoods = Array.from({ length: 20 }, (_, i) => childhood(i + 1, deadly));

describe('the founder\'s childhood (D-480, D-481, T.3)', () => {
  it('20 seeds: the founder lives to go out, gets only the scenes and the early years, pays nothing', () => {
    for (const run of childhoods) {
      const { state } = run;
      expect(run.problems, `seed ${state.seed}`).toEqual([]);
      const founder = state.characters.find((c) => c.id === state.backstory.founder)!;
      expect(founder.deathDay).toBeNull();
      expect(ageYears(founder.birthDay, state.day)).toBeGreaterThanOrEqual(START_AGE_MIN);
      // the money at going out: the start money and what the scenes gave
      expect(founder.money).toBe(content.settings.startMoney + run.fromScenes);
      // the first day after he goes out the player chooses an occupation
      expect(availableActions({ state, content: deadly }).length).toBeGreaterThan(0);
    }
    // the scene with money was played in some seeds
    expect(childhoods.some((r) => r.fromScenes > 0)).toBe(true);
  });

  it('20 seeds: every parent alive at the birth is dead or missing by the time he goes out; the line is dated the real day', () => {
    let fates = 0;
    let earlier = 0;
    for (const { state, parents } of childhoods) {
      const lines = allChronicle(state);
      const out = lines.find((e) => e.kind === 'backstory_end')!;
      expect(state.backstory.fates.map((f) => f.person).sort()).toEqual([...parents].sort());
      for (const f of state.backstory.fates) {
        const parent = state.characters.find((c) => c.id === f.person)!;
        expect(f.done).toBe(true);
        expect(parent.deathDay).not.toBeNull();
        expect(parent.deathDay!).toBeLessThan(out.day);
        expect(f.day).toBeLessThan(shiftYears(0, START_AGE_MIN));
        const line = lines.find((e) => e.kind === 'backstory_fate' && e.parts.some((p) => typeof p !== "string" && "id" in p && p.id === parent.id));
        if (parent.deathDay === f.day && parent.deathCause === f.cause && line) {
          fates += 1;
          expect(line.day).toBe(f.day);
          expect(line.subject).toBe(state.backstory.founder);
          if (f.kind === 'missing') expect(parent.deathCause).toBe('vanished');
        } else {
          // a natural death came first and stays (D-481): no line of the fate
          earlier += 1;
          expect(parent.deathDay!).toBeLessThan(f.day);
          expect(line).toBeUndefined();
        }
      }
    }
    expect(fates).toBeGreaterThan(0);
    expect(earlier).toBeGreaterThan(0);
  });

  it('draws the fates from a stream of their own: the world draws the same without them', () => {
    const without = { ...content, backstory: { ...content.backstory!, fates: undefined } };
    for (const seed of [1, 2, 3]) {
      const a = newGame(seed, content);
      const b = newGame(seed, without);
      expect(a.rng).toEqual(b.rng);
      expect(b.backstory.fates).toEqual([]);
      expect(newGame(seed, content).backstory.fates).toEqual(a.backstory.fates);
    }
  });

  it('drops a death ordered for the founder in his childhood; his heirs and the grown founder have no such safety', () => {
    const state = newGame(3, deadly);
    const founder = getPlayer(state);
    if (state.status === 'running') apply(state, deadly, { type: 'wait', days: 1 });
    state.deathRequests.push({ characterId: founder.id, cause: 'killed' });
    while (state.status !== 'running') apply(state, deadly, botCommand(state, deadly, seedRng(3, 5)));
    apply(state, deadly, { type: 'wait', days: 1 });
    expect(founder.deathDay).toBeNull();
    expect(state.deathRequests).toEqual([]);
    const grown = childhood(3, deadly).state;
    const hero = getPlayer(grown);
    grown.deathRequests.push({ characterId: hero.id, cause: 'killed' });
    if (grown.status !== 'running') apply(grown, deadly, { type: 'start', actionId: availableActions({ state: grown, content: deadly })[0]!.id });
    apply(grown, deadly, { type: 'wait', days: 1 });
    expect(hero.deathDay).not.toBeNull();
  });
});

/**
 * The real content with the clock on for the test (T.4 turns it on): the economy, the boards and the narrator of the
 * real game leave the child founder alone; the chronicle reads birth … fate … going out.
 */
describe('the founder\'s childhood in the real content with fromBirth on (T.3)', () => {
  const real = realContent();
  const clock: Content = { ...real, backstory: { ...real.backstory!, fromBirth: true } };
  it('seed 42: only scenes, no costs, no boards; the parents\' fates are in the chronicle before he goes out', () => {
    const run = childhood(42, clock);
    expect(run.problems).toEqual([]);
    const founder = getPlayer(run.state);
    expect(founder.money).toBe(real.settings.startMoney + run.fromScenes);
    const kinds = allChronicle(run.state).filter((e) => e.level === 'chronicle').map((e) => e.kind);
    expect(kinds[0]).toBe('start');
    expect(kinds.indexOf('backstory_fate')).toBeGreaterThan(0);
    expect(kinds.indexOf('backstory_fate')).toBeLessThan(kinds.indexOf('backstory_end'));
    const sim = runSim(clock, { seed: 42, years: 30 });
    expect(sim.violations).toEqual([]);
  }, 120_000);
});
