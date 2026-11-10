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
 * dies of old age or illness here: the founder's safety in the childhood (D-480) is T.3, and a dead founder has no scenes.
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
