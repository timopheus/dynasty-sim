import { interruptAction } from '../actions/actions';
import { EARLY_YEARS, shieldedFounder } from '../backstory/backstory';
import { kill } from '../lifecycle';
import { chancePer } from '../rng';
import type { Character, Ctx, DayPhase } from '../state';
import { ageYears } from '../time/calendar';
import { detailedCharacters } from '../world/world';
import { addCondition, conditionDef, hasCondition, isSeverelyIll, weeklyTransition } from './course';
import { DAILY_DEATH_DENOMINATOR, dailyDeathChance, deathCause } from './mortality';

/** Transitions and onsets are rolled once a week (GDD 8.4), on days divisible by this. */
export const HEALTH_WEEK = 7;

/** One week of one character: each condition rolls its transition, then new conditions may begin. Returns true on death. */
function healthWeek(ctx: Ctx, c: Character): boolean {
  const { state, content } = ctx;
  // A copy: recovery removes the condition, and a condition that follows waits for next week.
  for (const hc of [...c.conditions]) {
    // the founder's childhood (D-480): an illness never comes to death, it stays at its stage and rolls again next week
    if (weeklyTransition(ctx, c, hc) && !shieldedFounder(ctx, c.id)) {
      kill(ctx, c, conditionDef(content, hc.id).cause);
      return true;
    }
  }
  const age = ageYears(c.birthDay, state.day);
  for (const onset of content.health.onsets) {
    if (age < onset.ageMin || hasCondition(c, onset.condition)) continue;
    if (chancePer(state.rng, onset.per10k, 10000)) addCondition(ctx, c, onset.condition, onset.text);
  }
  return false;
}

/**
 * Health of detailed characters (D-053): weekly transitions and onsets; death
 * from a stage. A severe stage breaks off the hero's action unless it is rest.
 * Returns true when the player has a decision to make.
 */
export const healthPhase: DayPhase = {
  id: 'health',
  run(ctx) {
    const { state, content } = ctx;
    if (state.day % HEALTH_WEEK === 0) {
      const playerId = state.playerId; // death hands the house to an heir
      let playerDied = false;
      for (const c of detailedCharacters(state)) {
        if (healthWeek(ctx, c) && c.id === playerId) playerDied = true;
      }
      if (playerDied) return true;
    }
    const active = state.activeAction;
    // the founder's early years (D-479) are no occupation an illness breaks off: he waits for the next scene at home
    const childhood = active?.actionId === EARLY_YEARS && shieldedFounder(ctx, state.playerId);
    if (active && !childhood && !content.health.rest.actions.includes(active.actionId)) {
      const hero = detailedCharacters(state).find((c) => c.id === state.playerId);
      if (hero && isSeverelyIll(content, hero)) {
        interruptAction(ctx, content.health.texts.interrupted);
        return true;
      }
    }
    return false;
  },
};

/**
 * Carries out the deaths ordered by effects (D-164), in order; a request for someone already dead is dropped.
 * Returns true if the player died.
 */
function deathRequests(ctx: Ctx): boolean {
  const { state } = ctx;
  const requests = state.deathRequests;
  if (requests.length === 0) return false;
  state.deathRequests = [];
  const playerId = state.playerId; // death hands the house to an heir
  let playerDied = false;
  for (const r of requests) {
    const c = state.characters.find((x) => x.id === r.characterId);
    // the founder never dies in his childhood (D-480): a death ordered for him is dropped
    if (!c || c.deathDay !== null || shieldedFounder(ctx, c.id)) continue;
    if (c.id === playerId) playerDied = true;
    kill(ctx, c, r.cause);
  }
  return playerDied;
}

/**
 * Deaths ordered by effects first, then the death roll for every detailed character. The player's death stops
 * the day for succession.
 */
export const deathPhase: DayPhase = {
  id: 'death',
  run(ctx) {
    const { state } = ctx;
    if (deathRequests(ctx)) return true;
    let playerDied = false;
    for (const c of detailedCharacters(state)) {
      // the roll is made for the founder in his childhood too, so the world draws the same; death passes him by (D-480)
      if (chancePer(state.rng, dailyDeathChance(ctx, c), DAILY_DEATH_DENOMINATOR) && !shieldedFounder(ctx, c.id)) {
        if (c.id === state.playerId) playerDied = true;
        kill(ctx, c, deathCause(ctx, c));
      }
    }
    return playerDied;
  },
};
