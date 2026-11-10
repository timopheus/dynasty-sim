import { log } from '../chronicle/log';
import { ANNUAL_DEATH_DENOMINATOR, annualDeathChance, mortalityRow } from '../health/mortality';
import { getPlayer } from '../helpers';
import { createCharacter, kill } from '../lifecycle';
import { chancePer, int, pick, weightedPick } from '../rng';
import type { Character, Ctx, DayPhase, GameState, NewGameHook } from '../state';
import { ageYears, toYmd } from '../time/calendar';
import { occupationsForAge, type MoveDef, type PopulationContent } from './content';

/** Alive and far: not the hero, not in the circle, not in the household (the household is near, D-313, D-354). */
function isFarAlive(state: GameState, c: Character, inCircle: ReadonlySet<string>): boolean {
  return c.deathDay === null && c.id !== state.playerId && !inCircle.has(c.id) && !state.household.includes(c.id);
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

/** Peers of a child hero (D-479, T.2): the span of ages around the hero, and how many the circle holds. */
const PEER_SPREAD = 3;
const PEERS = { min: 2, max: 4 };

function isPeer(ctx: Ctx, c: Character, heroAge: number): boolean {
  return Math.abs(ageYears(c.birthDay, ctx.state.day) - heroAge) <= PEER_SPREAD;
}

function heroAgeIfChild(ctx: Ctx): number | null {
  const hero = ctx.state.characters.find((c) => c.id === ctx.state.playerId);
  if (!hero) return null;
  const age = ageYears(hero.birthDay, ctx.state.day);
  return age < ctx.content.settings.adultAge ? age : null;
}

/**
 * While the hero is a child the neighbours' children grow up beside them (D-479): when fewer than `PEERS.min` people of
 * the circle are within `PEER_SPREAD` years of the hero, children of that age join, up to a draw of `PEERS.min…max`.
 * They do not drift away while the hero is a child. Never grows the circle beyond its hard cap.
 */
function ensurePeers(ctx: Ctx, population: PopulationContent): void {
  const { state } = ctx;
  const heroAge = heroAgeIfChild(ctx);
  if (heroAge === null) return;
  const peers = state.circle.filter((id) => {
    const c = state.characters.find((x) => x.id === id);
    return c !== undefined && c.deathDay === null && isPeer(ctx, c, heroAge);
  }).length;
  if (peers >= PEERS.min) return;
  const want = int(state.rng, PEERS.min, PEERS.max);
  const ages = { min: Math.max(0, heroAge - PEER_SPREAD), max: heroAge + PEER_SPREAD };
  for (let i = peers; i < want && state.circle.length < population.circle.max; i++) {
    const c = createCharacter(ctx, { surname: pick(state.rng, ctx.content.names.surnames), age: ages });
    state.circle.push(c.id);
  }
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
  log(ctx, { subject: getPlayer(state), kind: 'move', level: 'journal', template: move.text });
}

/**
 * Yearly tick, 1 January (D-112). People of the circle may drift away; everyone far away rolls for
 * death by `annualDeathChance`, may change occupation and may return to the circle if there is room.
 */
function yearlyTick(ctx: Ctx, population: PopulationContent): void {
  const { state } = ctx;
  let inCircle = new Set(state.circle);
  const heroAge = heroAgeIfChild(ctx);
  // Deaths do not add characters, and nobody far is the hero, so the list is stable while we walk it.
  for (const c of state.characters) {
    // The hero and the household are simulated day by day (D-313, D-354): no yearly roll of the far for them.
    if (c.deathDay !== null || c.id === state.playerId || state.household.includes(c.id)) continue;
    const age = ageYears(c.birthDay, state.day);
    if (inCircle.has(c.id)) {
      if (heroAge !== null && isPeer(ctx, c, heroAge)) continue; // the hero's peers stay while the hero is a child (D-479)
      if (chancePer(state.rng, population.driftPer10k, 10000)) {
        leaveCircle(state, c.id);
        inCircle.delete(c.id);
      }
      continue;
    }
    if (chancePer(state.rng, annualDeathChance(age), ANNUAL_DEATH_DENOMINATOR)) {
      kill(ctx, c, mortalityRow(ctx.content, age).cause);
      // a death may bring someone far into the circle (the next guardian of a young hero, D-314): they must not join twice
      inCircle = new Set(state.circle);
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

/**
 * Circle upkeep (D-110): the yearly tick of people far away (first world phase of a new year), the move when the hero
 * completes a moving action, and a refill to the lower bound. Never stops the day.
 */
export const worldPhase: DayPhase = {
  id: 'world',
  run(ctx) {
    const { state, content } = ctx;
    const population = content.population;
    if (!population) return false;
    // By year, not by the date: a stop earlier in the day (the hero's death) must not skip the tick.
    const year = toYmd(state.day).year;
    if (state.lastTickYear === null) state.lastTickYear = year;
    else if (year > state.lastTickYear) {
      state.lastTickYear = year;
      yearlyTick(ctx, population);
    }
    const active = state.activeAction;
    if (active && state.day >= active.endDay && !state.interruptRequest && state.lastMoveEndDay !== active.endDay) {
      const move = population.moves.find((m) => m.action === active.actionId);
      if (move) {
        state.lastMoveEndDay = active.endDay;
        applyMove(ctx, population, move);
      }
    }
    ensurePeers(ctx, population);
    refillCircle(ctx, population);
    return false;
  },
};

/**
 * New game hook (D-167): the circle is filled before the backstory, so scenes find people for their roles (3.11).
 * The first world phase then finds it full and only starts the yearly clock.
 */
export const worldOnNewGame: NewGameHook = (ctx) => {
  if (!ctx.content.population) return;
  ensurePeers(ctx, ctx.content.population);
  refillCircle(ctx, ctx.content.population);
};
