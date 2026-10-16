import { findCharacter } from '../helpers';
import { weightedPick } from '../rng';
import type { Character, Ctx } from '../state';
import { ageYears } from '../time/calendar';
import { occupationsForAge } from '../world/content';
import { spouseOf } from './family';
import { childrenOf, parentsOf, siblingsOf } from './kin';

/**
 * The hero's household (D-313): near the hero like the circle (D-056, D-321), kept apart from it. An adult hero: the
 * spouse and the children under `adultAge`. A hero under `adultAge`: the living parents and the brothers and sisters
 * under age. This file keeps `state.household` in step; it is called by the family phase, the marriage and the change
 * of the head. Never imports lifecycle.ts, events/ or effects.ts: the marriage effect reaches it.
 */

function isMinor(ctx: Ctx, c: Character): boolean {
  return ageYears(c.birthDay, ctx.state.day) < ctx.content.settings.adultAge;
}

/** Who should be in the household now, in a fixed order: spouse, then children (or parents, then siblings). */
export function wantedHousehold(ctx: Ctx): string[] {
  const { state } = ctx;
  const hero = findCharacter(state, state.playerId);
  if (!hero || hero.deathDay !== null) return [];
  const alive = (c: Character) => c.deathDay === null && c.id !== hero.id;
  if (!isMinor(ctx, hero)) {
    const spouse = spouseOf(ctx, hero.id);
    const children = childrenOf(state, hero.id).filter((c) => alive(c) && isMinor(ctx, c));
    return [...(spouse && alive(spouse) ? [spouse.id] : []), ...children.map((c) => c.id)];
  }
  const parents = parentsOf(state, hero.id).filter(alive);
  const siblings = siblingsOf(state, hero.id).filter((c) => alive(c) && isMinor(ctx, c));
  return [...parents, ...siblings].map((c) => c.id);
}

/**
 * An adult of the world needs an occupation (world invariant): one fitting the age, by weight, from the stream in
 * `state.rng`. Nothing without the population section or when the person has one.
 */
export function ensureOccupation(ctx: Ctx, c: Character): void {
  const population = ctx.content.population;
  if (!population || c.occupation !== null) return;
  const fitting = occupationsForAge(population, Math.max(ctx.content.settings.adultAge, ageYears(c.birthDay, ctx.state.day)));
  const options = fitting.length > 0 ? fitting : population.occupations;
  c.occupation = weightedPick(ctx.state.rng, options, (o) => o.weight).id;
}

/** Someone leaves the household: an adult gets an occupation and joins the circle if there is room, else goes far. */
function leave(ctx: Ctx, c: Character): void {
  const { state, content } = ctx;
  if (c.deathDay !== null || c.id === state.playerId || isMinor(ctx, c)) return;
  ensureOccupation(ctx, c);
  const population = content.population;
  if (population && state.circle.length < population.circle.max && !state.circle.includes(c.id)) state.circle.push(c.id);
}

/** Brings `state.household` in step with `wantedHousehold`: those who no longer belong leave, the new ones join. */
export function syncHousehold(ctx: Ctx): void {
  const { state } = ctx;
  const wanted = wantedHousehold(ctx);
  const keep = new Set(wanted);
  const leaving = state.household.filter((id) => !keep.has(id));
  if (leaving.length > 0) {
    state.household = state.household.filter((id) => keep.has(id));
    for (const id of leaving) {
      const c = findCharacter(state, id);
      if (c) leave(ctx, c);
    }
  }
  const have = new Set(state.household);
  state.household.push(...wanted.filter((id) => !have.has(id)));
  dropHouseholdFromCircle(ctx);
}

/**
 * The household and the hero are never in the circle. The world phase does not know the household (the yearly return
 * of people far away may bring a member back), so the family phase takes such a member out again the same day.
 */
export function dropHouseholdFromCircle(ctx: Ctx): void {
  const { state } = ctx;
  const out = (id: string) => id === state.playerId || state.household.includes(id);
  if (state.circle.some(out)) state.circle = state.circle.filter((id) => !out(id));
}
