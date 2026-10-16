import { interruptAction } from '../actions/actions';
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
    if (weeklyTransition(ctx, c, hc)) {
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
    if (active && !content.health.rest.actions.includes(active.actionId)) {
      const hero = detailedCharacters(state).find((c) => c.id === state.playerId);
      if (hero && isSeverelyIll(content, hero)) {
        interruptAction(ctx, content.health.texts.interrupted);
        return true;
      }
    }
    return false;
  },
};

/** Death roll for every detailed character. The player's death stops the day for succession. */
export const deathPhase: DayPhase = {
  id: 'death',
  run(ctx) {
    const { state } = ctx;
    let playerDied = false;
    for (const c of detailedCharacters(state)) {
      if (chancePer(state.rng, dailyDeathChance(ctx, c), DAILY_DEATH_DENOMINATOR)) {
        if (c.id === state.playerId) playerDied = true;
        kill(ctx, c, deathCause(ctx, c));
      }
    }
    return playerDied;
  },
};
