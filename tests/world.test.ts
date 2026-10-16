import { beforeAll, describe, expect, it } from 'vitest';
import { botCommand } from '../src/core/bot';
import { mortalityRow } from '../src/core/health/mortality';
import { createCharacter, kill } from '../src/core/lifecycle';
import { apply, DAY_PHASES, newGame } from '../src/core/game';
import { checkInvariants } from '../src/core/invariants';
import { getPlayer } from '../src/core/helpers';
import { seedRng } from '../src/core/rng';
import { deserialize, serialize } from '../src/core/save/save';
import type { Character, Ctx, DayPhase, GameState } from '../src/core/state';
import { fromYmd, START_YEAR } from '../src/core/time/calendar';
import { detailedCharacters } from '../src/core/world/world';
import { worldPhase } from '../src/core/world/phases';
import { BASE_FILES, loadOrThrow } from './fixtures/content';
import { readContentFiles } from '../tools/content-files';

/**
 * game.ts still imports the placeholder `worldPhase` from world/world.ts; the working phase is in
 * world/phases.ts (it needs lifecycle.ts). Until the lead session of the stage points game.ts at
 * phases.ts, the tests swap the phase in; afterwards this is a no-op and can be deleted.
 */
beforeAll(() => {
  const phases = DAY_PHASES as DayPhase[];
  phases[phases.findIndex((p) => p.id === 'world')] = worldPhase;
});

const content = loadOrThrow([...BASE_FILES, ...readContentFiles('tests/fixtures/population')]);
const pop = content.population ?? fail('fixture has no population');
function fail(message: string): never {
  throw new Error(message);
}

const ctxOf = (state: GameState): Ctx => ({ state, content });
const circleOf = (state: GameState): Character[] => detailedCharacters(state).slice(1);
const living = (state: GameState) => state.characters.filter((c) => c.deathDay === null);

/** Runs the day loop under a random bot for the given number of years, checking invariants after every command. */
function play(state: GameState, years: number, seed = 1): void {
  const bot = seedRng(seed, 1);
  const endDay = fromYmd(START_YEAR + years, 1, 1);
  while (state.day < endDay) {
    apply(state, content, botCommand(state, content, bot));
    const problems = checkInvariants(state, content);
    expect(problems).toEqual([]);
    expect(state.circle.length).toBeLessThanOrEqual(pop.circle.max);
  }
}

describe('the circle', () => {
  it('is empty at the start and filled to its lower bound on the first day', () => {
    const state = newGame(5, content);
    expect(state.circle).toEqual([]);
    apply(state, content, { type: 'start', actionId: 'rest' });
    expect(state.circle.length).toBeGreaterThanOrEqual(pop.circle.min);
    expect(state.circle.length).toBeLessThanOrEqual(pop.circle.max);
    expect(detailedCharacters(state)).toHaveLength(state.circle.length + 1);
    expect(detailedCharacters(state)[0]).toBe(getPlayer(state));
  });

  it('holds only living people who are not the hero, each with an occupation of its age', () => {
    const state = newGame(6, content);
    play(state, 10);
    for (const c of circleOf(state)) {
      expect(c.deathDay).toBeNull();
      expect(c.id).not.toBe(state.playerId);
      expect(pop.occupations.map((o) => o.id)).toContain(c.occupation);
    }
    expect(new Set(state.circle).size).toBe(state.circle.length);
  });

  it('loses a person at once when they die, and refills the next day', () => {
    const state = newGame(7, content);
    apply(state, content, { type: 'start', actionId: 'rest' });
    const victim = circleOf(state)[0] as Character;
    const before = state.circle.length;
    // The death hook runs inside kill; the invariants must hold right after it.
    kill(ctxOf(state), victim, 'illness');
    expect(state.circle).not.toContain(victim.id);
    expect(state.circle.length).toBe(before - 1);
    expect(checkInvariants(state, content)).toEqual([]);
    worldPhase.run(ctxOf(state));
    expect(state.circle.length).toBeGreaterThanOrEqual(pop.circle.min);
  });

  it('does not take in the heir: the new hero is never in the circle', () => {
    const state = newGame(8, content);
    const heads = new Set<string>();
    const bot = seedRng(8, 1);
    const endDay = fromYmd(START_YEAR + 120, 1, 1);
    while (state.day < endDay) {
      apply(state, content, botCommand(state, content, bot));
      heads.add(state.playerId);
      expect(state.circle).not.toContain(state.playerId);
    }
    expect(heads.size).toBeGreaterThan(1);
  });

  it('stays empty when the content has no population', () => {
    const none = { ...content, population: null };
    const state = newGame(9, none);
    for (let i = 0; i < 5; i++) apply(state, none, { type: 'start', actionId: 'rest' });
    expect(state.circle).toEqual([]);
    expect(detailedCharacters(state)).toHaveLength(1);
    expect(checkInvariants(state, none)).toEqual([]);
  });
});

describe('moves', () => {
  it('replace part of the circle when the hero completes a moving action', () => {
    const state = newGame(11, content);
    apply(state, content, { type: 'start', actionId: 'rest' }); // fills the circle
    const before = [...state.circle];
    // Skip chance events: only the move matters here.
    const quiet = { ...content, settings: { ...content.settings, eventChancePer10k: 0 } };
    apply(state, quiet, { type: 'start', actionId: 'wait' });
    const after = state.circle;
    const gone = before.filter((id) => !after.includes(id));
    const added = after.filter((id) => !before.includes(id));
    expect(gone.length).toBeGreaterThanOrEqual(2);
    expect(added.length).toBeGreaterThanOrEqual(1);
    expect(after.length).toBeLessThanOrEqual(pop.circle.max);
    expect(after.length).toBeGreaterThanOrEqual(pop.circle.min);
    // Those who stayed behind are alive, far away, and not in the circle.
    for (const id of gone) {
      const c = state.characters.find((x) => x.id === id) as Character;
      if (c.deathDay === null) expect(after).not.toContain(id);
    }
    const line = state.chronicle.filter((e) => e.kind === 'move');
    expect(line).toHaveLength(1);
    expect(line[0]?.level).toBe('journal');
    expect(line[0]?.subject).toBe(state.playerId);
    expect(checkInvariants(state, quiet)).toEqual([]);
  });

  it('are not applied to an interrupted action, nor twice for one action', () => {
    const quiet = { ...content, settings: { ...content.settings, eventChancePer10k: 0 } };
    const state = newGame(12, quiet);
    apply(state, quiet, { type: 'start', actionId: 'rest' });
    apply(state, quiet, { type: 'start', actionId: 'wait' });
    expect(state.chronicle.filter((e) => e.kind === 'move')).toHaveLength(1);
    const after = [...state.circle];
    // Pretend the action is still active on its end day: the same move must not run again.
    state.activeAction = { actionId: 'wait', endDay: state.lastMoveEndDay as number };
    worldPhase.run(ctxOf(state));
    expect(state.circle).toEqual(after);

    state.activeAction = { actionId: 'wait', endDay: state.day };
    state.interruptRequest = { template: null };
    worldPhase.run(ctxOf(state));
    expect(state.circle).toEqual(after);
    expect(state.chronicle.filter((e) => e.kind === 'move')).toHaveLength(1);
  });

  it('leave the circle alone for other actions', () => {
    const state = newGame(11, content);
    apply(state, content, { type: 'start', actionId: 'rest' });
    const quiet = { ...content, settings: { ...content.settings, eventChancePer10k: 0 } };
    const before = [...state.circle];
    apply(state, quiet, { type: 'start', actionId: 'rest' });
    expect(state.chronicle.filter((e) => e.kind === 'move')).toHaveLength(0);
    // Without a move only deaths change the circle, and rest lasts at most 10 days.
    expect(before.filter((id) => !state.circle.includes(id)).length).toBeLessThanOrEqual(1);
  });
});

describe('the yearly tick of people far away', () => {
  /** A state on 31 December with a far crowd of the given age; returns the crowd. */
  function withCrowd(age: number, n: number, seed = 21): { state: GameState; crowd: Character[] } {
    const state = newGame(seed, content);
    apply(state, content, { type: 'start', actionId: 'rest' });
    const ctx = ctxOf(state);
    const crowd: Character[] = [];
    for (let i = 0; i < n; i++) {
      const c = createCharacter(ctx, { surname: 'Far', age: { min: age, max: age } });
      c.occupation = 'guard';
      crowd.push(c);
    }
    state.day = fromYmd(START_YEAR + 3, 1, 1);
    state.lastTickYear = START_YEAR + 2;
    return { state, crowd };
  }

  it('kills the old by annualDeathChance with the cause of the mortality table, and leaves the young mostly alone', () => {
    const old = withCrowd(95, 300);
    worldPhase.run(ctxOf(old.state));
    const dead = old.crowd.filter((c) => c.deathDay !== null);
    // 40% a year at 90+: 120 of 300 expected, sd about 8.
    expect(dead.length).toBeGreaterThan(80);
    expect(dead.length).toBeLessThan(160);
    expect(dead.every((c) => c.deathCause === mortalityRow(content, 95).cause && c.deathDay === old.state.day)).toBe(true);
    expect(old.state.circle.some((id) => dead.some((c) => c.id === id))).toBe(false);

    const young = withCrowd(20, 300);
    worldPhase.run(ctxOf(young.state));
    // 1% a year at 20: 3 expected.
    expect(young.crowd.filter((c) => c.deathDay !== null).length).toBeLessThan(15);
  });

  it('runs once in the first world phase of a new year, whatever the date', () => {
    const a = withCrowd(95, 100);
    a.state.day += 40; // the phase of 1 January was lost to an earlier stop
    worldPhase.run(ctxOf(a.state));
    expect(a.crowd.some((c) => c.deathDay !== null)).toBe(true);
    const rng = JSON.stringify(a.state.rng);
    worldPhase.run(ctxOf(a.state));
    expect(JSON.stringify(a.state.rng)).toBe(rng);
  });

  it('does nothing within the year of the last tick', () => {
    const { state, crowd } = withCrowd(95, 100);
    state.lastTickYear = START_YEAR + 3;
    const rng = JSON.stringify(state.rng);
    const circle = [...state.circle];
    worldPhase.run(ctxOf(state));
    expect(crowd.every((c) => c.deathDay === null)).toBe(true);
    expect(JSON.stringify(state.rng)).toBe(rng);
    expect(state.circle).toEqual(circle);
  });

  it('changes occupations and lets some come back while there is room', () => {
    const { state, crowd } = withCrowd(30, 200);
    state.circle = state.circle.slice(0, 2);
    worldPhase.run(ctxOf(state));
    const alive = crowd.filter((c) => c.deathDay === null);
    expect(alive.filter((c) => c.occupation !== 'guard').length).toBeGreaterThan(10);
    expect(alive.some((c) => state.circle.includes(c.id))).toBe(true);
    expect(state.circle.length).toBeLessThanOrEqual(pop.circle.max);
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it('lets circle members drift away, and they stay alive', () => {
    const all = { ...content, population: { ...pop, driftPer10k: 10000 } };
    const state = newGame(31, all);
    apply(state, all, { type: 'start', actionId: 'rest' });
    const members = [...state.circle];
    expect(members.length).toBeGreaterThan(0);
    state.day = fromYmd(START_YEAR + 3, 1, 1);
    state.lastTickYear = START_YEAR + 2;
    worldPhase.run({ state, content: all });
    // Everyone drifted; the phase then refilled the circle with other people.
    for (const id of members) {
      expect(state.circle).not.toContain(id);
      expect((state.characters.find((c) => c.id === id) as Character).deathDay).toBeNull();
    }
    expect(checkInvariants(state, all)).toEqual([]);
  });
});

describe('a whole run', () => {
  it('keeps the circle in range and the invariants for 60 years', () => {
    const state = newGame(41, content);
    play(state, 60, 41);
    expect(state.circle.length).toBeGreaterThanOrEqual(1);
    // Most people ever created are far or dead; the circle stays small.
    expect(living(state).length).toBeGreaterThan(state.circle.length);
  });

  it('gives the same chronicle for the same seed', () => {
    const a = newGame(42, content);
    const b = newGame(42, content);
    play(a, 20, 42);
    play(b, 20, 42);
    expect(serialize(b)).toBe(serialize(a));
  });

  it('continues identically after a save and load', () => {
    const a = newGame(43, content);
    play(a, 8, 43);
    const b = deserialize(serialize(a), content);
    expect(b).toEqual(a);
    const botA = seedRng(43, 9);
    const botB = seedRng(43, 9);
    for (let i = 0; i < 40; i++) {
      apply(a, content, botCommand(a, content, botA));
      apply(b, content, botCommand(b, content, botB));
    }
    expect(serialize(b)).toBe(serialize(a));
  });
});
