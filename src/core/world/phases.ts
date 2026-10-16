import { log } from '../chronicle/log';
import { ANNUAL_DEATH_DENOMINATOR, annualDeathChance } from '../health/mortality';
import { getPlayer } from '../helpers';
import { createCharacter, kill } from '../lifecycle';
import { chancePer, int, pick, weightedPick } from '../rng';
import type { Character, Ctx, DayPhase, GameState } from '../state';
import { ageYears, toYmd } from '../time/calendar';
import { occupationsForAge, type MoveDef, type PopulationContent } from './content';

/** Cause of death id for people far away: the yearly roll is by age only (D-112). */
export const FAR_DEATH_CAUSE = 'natural';

function isFarAlive(state: GameState, c: Character, inCircle: ReadonlySet<string>): boolean {
  return c.deathDay === null && c.id !== state.playerId && !inCircle.has(c.id);
}

function pickOccupation(ctx: Ctx, population: PopulationContent, age: number): string {
  const options = occupationsForAge(population, age);
  return weightedPick(ctx.state.rng, options, (o) => o.weight).id;
}

/** A new person joins the circle: created by the character module, given an occupation here. */
function spawnNewcomer(ctx: Ctx, population: PopulationContent): Character {
  const { state, content } = ctx;
  const c = createCharacter(ctx, { surname: pick(state.rng, content.names.surnames), age: population.newcomerAge });
  c.occupation = pickOccupation(ctx, population, ageYears(c.birthDay, state.day));
  state.circle.push(c.id);
  return c;
}

/** Fills the circle up to its lower bound with new people. */
function refillCircle(ctx: Ctx, population: PopulationContent): void {
  while (ctx.state.circle.length < population.circle.min) spawnNewcomer(ctx, population);
}

function leaveCircle(state: GameState, id: string): void {
  state.circle = state.circle.filter((x) => x !== id);
}

/** Living people far away who could walk into the circle now, except those who have just left it. */
function farNewcomers(ctx: Ctx, population: PopulationContent, except: ReadonlySet<string>): Character[] {
  const { state } = ctx;
  const inCircle = new Set(state.circle);
  return state.characters.filter((c) => {
    if (!isFarAlive(state, c, inCircle) || except.has(c.id)) return false;
    const age = ageYears(c.birthDay, state.day);
    return age >= population.newcomerAge.min && age <= population.newcomerAge.max;
  });
}

/** The hero completes an action that moves the circle: some stay behind, others join (D-110). */
function applyMove(ctx: Ctx, population: PopulationContent, move: MoveDef): void {
  const { state } = ctx;
  const leaving = Math.min(int(state.rng, move.leave.min, move.leave.max), state.circle.length);
  const left = new Set<string>();
  for (let i = 0; i < leaving; i++) {
    const id = pick(state.rng, state.circle);
    left.add(id);
    leaveCircle(state, id);
  }
  const arriving = Math.min(int(state.rng, move.arrive.min, move.arrive.max), population.circle.max - state.circle.length);
  for (let i = 0; i < arriving; i++) {
    const far = chancePer(state.rng, population.arriveFromFarPer100, 100) ? farNewcomers(ctx, population, left) : [];
    if (far.length > 0) state.circle.push(pick(state.rng, far).id);
    else spawnNewcomer(ctx, population);
  }
  log(state, { subject: getPlayer(state), kind: 'move', level: 'journal', template: move.text });
}

/**
 * Yearly tick, 1 January (D-112). People of the circle may drift away; everyone far away rolls for
 * death by `annualDeathChance`, may change occupation and may return to the circle if there is room.
 */
function yearlyTick(ctx: Ctx, population: PopulationContent): void {
  const { state } = ctx;
  const inCircle = new Set(state.circle);
  // Deaths do not add characters, and nobody far is the hero, so the list is stable while we walk it.
  for (const c of state.characters) {
    if (c.deathDay !== null || c.id === state.playerId) continue;
    const age = ageYears(c.birthDay, state.day);
    if (inCircle.has(c.id)) {
      if (chancePer(state.rng, population.driftPer10k, 10000)) {
        leaveCircle(state, c.id);
        inCircle.delete(c.id);
      }
      continue;
    }
    if (chancePer(state.rng, annualDeathChance(age), ANNUAL_DEATH_DENOMINATOR)) {
      kill(ctx, c, FAR_DEATH_CAUSE);
      continue;
    }
    if (chancePer(state.rng, population.far.occupationChangePer10k, 10000)) {
      const options = occupationsForAge(population, age).filter((o) => o.id !== c.occupation);
      if (options.length > 0) c.occupation = weightedPick(state.rng, options, (o) => o.weight).id;
    }
    const canReturn = age >= population.newcomerAge.min && age <= population.newcomerAge.max;
    if (canReturn && state.circle.length < population.circle.max && chancePer(state.rng, population.far.returnPer10k, 10000)) {
      state.circle.push(c.id);
      inCircle.add(c.id);
    }
  }
}

function isNewYearDay(day: number): boolean {
  const { month, day: d } = toYmd(day);
  return month === 1 && d === 1;
}

/**
 * Circle upkeep (D-110): the yearly tick of people far away on 1 January, the move when the hero
 * completes a moving action, and a refill to the lower bound. Never stops the day.
 */
export const worldPhase: DayPhase = {
  id: 'world',
  run(ctx) {
    const { state, content } = ctx;
    const population = content.population;
    if (!population) return false;
    if (isNewYearDay(state.day)) yearlyTick(ctx, population);
    const active = state.activeAction;
    if (active && state.day >= active.endDay && !state.interruptRequest) {
      const move = population.moves.find((m) => m.action === active.actionId);
      if (move) applyMove(ctx, population, move);
    }
    refillCircle(ctx, population);
    return false;
  },
};
