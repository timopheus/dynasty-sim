import { findAction } from '../actions/actions';
import { conditionReport } from '../condition-keys';
import { factorParts, type FactorValue } from '../content/types';
import type { EventDef } from '../events/content';
import { eventWeight, findEvent, fireEvent, type FireResult } from '../events/events';
import { runNpcEvent } from '../events/npc';
import { findCharacter, getPlayer } from '../helpers';
import { chancePer, pick, weightedPick } from '../rng';
import { baseScope } from '../roles/roles';
import type { Character, Ctx, DayPhase, GameState, Scope } from '../state';
import { ageYears } from '../time/calendar';
import { dueEvents, storyGiven, storyWeight } from '../stories/stories';
import { DEFAULT_LONG_ACTION_DAYS, narratorContent, type NarratorContent } from './content';

interface Candidate {
  event: EventDef;
  weight: number;
  /** People of the story for its events (D-178); empty for the deck. */
  given: Scope;
}

const scale = (weight: number, factor: FactorValue): number => {
  const f = factorParts(factor);
  return Math.floor((weight * f.num) / f.den);
};

/** The tension now: it fades by `decayPerDay` with the days since it was last set (D-231). */
function currentTension(state: GameState, pace: NarratorContent): number {
  return Math.max(0, state.tension - (pace.tension?.decayPerDay ?? 0) * (state.day - state.tensionDay));
}

/** `once: life` is about the head of the house: a new head starts with an empty list. */
function syncLife(state: GameState): void {
  if (state.lifeHero === state.playerId) return;
  state.lifeHero = state.playerId;
  state.lifeFired = [];
}

/** Nominal length of the action: the mean of its range (D-168 speaks of the length of an action, not of its roll). */
function nominalDays(ctx: Ctx, actionId: string): number {
  const { min, max } = findAction(ctx.content, actionId).duration;
  return Math.floor((min + max) / 2);
}

const isLong = (pace: NarratorContent, days: number): boolean => days >= (pace.longActionDays ?? DEFAULT_LONG_ACTION_DAYS);

const isNotice = (event: EventDef): boolean => !event.options && !event.pages;

/** Records a fired event: pace memory, tension, counters. */
function remember(ctx: Ctx, pace: NarratorContent, event: EventDef, long: boolean): void {
  const { state } = ctx;
  state.lastFired[event.id] = state.day;
  state.lastEventDay = state.day;
  if (event.once === 'life' && !state.lifeFired.includes(event.id)) state.lifeFired.push(event.id);
  if (event.tags?.includes('way_up')) state.lastWayUpDay = state.day;
  const severity = event.severity ?? 'light';
  if (pace.tension && severity !== 'light') {
    state.tension = currentTension(state, pace) + pace.tension.gain[severity];
    state.tensionDay = state.day;
  }
  const stats = state.narratorStats;
  if (severity === 'heavy') stats.heavy += 1;
  if (isNotice(event)) stats.notices += 1;
  else if (long) stats.longEvents += 1;
  else stats.shortEvents += 1;
}

function launch(ctx: Ctx, pace: NarratorContent, event: EventDef, protagonist: Character, long: boolean, given: Scope = {}): FireResult {
  const result = fireEvent(ctx, event, protagonist, given);
  if (result !== 'failed') remember(ctx, pace, event, long);
  return result;
}

/** Whether the hero is at the bottom now; keeps `bottomSince` (D-233). Pure with respect to randomness. */
function atBottom(ctx: Ctx, pace: NarratorContent, hero: Character): boolean {
  const { state } = ctx;
  const bottom = pace.bottom;
  const yes = bottom !== undefined && conditionReport(ctx, hero, bottom.when, baseScope(hero, hero)).met;
  if (!yes) state.bottomSince = null;
  else state.bottomSince ??= state.day;
  return yes;
}

/** Deck events and story events that can fall now, with weights (D-232). Never consumes randomness. */
function candidates(ctx: Ctx, pace: NarratorContent, hero: Character, bottom: boolean): { deck: Candidate[]; stories: Candidate[] } {
  const { state, content } = ctx;
  syncLife(state);
  const tension = pace.tension ? currentTension(state, pace) : 0;
  const high = pace.tension !== undefined && tension >= pace.tension.high;
  const deck: Candidate[] = [];
  const stories: Candidate[] = [];
  // A hero under `adultAge` gets only the events bound to the action (upbringing, the guardian; D-314, D-364).
  const child = ageYears(hero.birthDay, state.day) < content.settings.adultAge;
  const action = state.activeAction?.actionId;
  for (const event of content.events) {
    if (event.followup_only || event.deck === 'backstory' || event.who === 'npc') continue;
    if (child && (action === undefined || !event.actions?.includes(action))) continue;
    if (event.once === 'game' && Object.hasOwn(state.lastFired, event.id)) continue;
    if (event.once === 'life' && state.lifeFired.includes(event.id)) continue;
    const cooldown = event.cooldown_days ?? pace.eventRepeatCooldownDays;
    if (Object.hasOwn(state.lastFired, event.id) && state.day - (state.lastFired[event.id] ?? 0) < cooldown) continue;
    const severity = event.severity ?? 'light';
    if (high && severity === 'heavy') continue;
    const given = event.story === undefined ? {} : ownGiven(event, storyGiven(state, hero.id, event.story));
    let weight = eventWeight(ctx, event, hero, given);
    if (weight <= 0) continue;
    if (event.story !== undefined) {
      weight = storyWeight(ctx, event.story, hero.id);
      if (weight > 0) stories.push({ event, weight, given });
      continue;
    }
    if (high && severity === 'light' && pace.tension) weight = scale(weight, pace.tension.lightFactor);
    if (bottom && pace.bottom && event.tags?.includes('way_up')) weight = scale(weight, pace.bottom.wayUpFactor);
    if (weight > 0) deck.push({ event, weight, given: {} });
  }
  return { deck, stories };
}

/** Only the people the event itself takes (its `pick: given` roles, D-178), not every person of the story. */
function ownGiven(event: EventDef, people: Scope): Scope {
  const out: Record<string, string> = {};
  for (const [name, role] of Object.entries(event.roles ?? {})) {
    const id = people[name];
    if (role.pick === 'given' && id !== undefined) out[name] = id;
  }
  return out;
}

const pickFrom = (ctx: Ctx, pool: Candidate[]): Candidate => weightedPick(ctx.state.rng, pool, (c) => c.weight);

/** Events a person of the world can have now: `who: npc|both`, not from the hero's own list (3.9). */
function npcPool(ctx: Ctx, person: Character): Candidate[] {
  const { state, content } = ctx;
  const pool: Candidate[] = [];
  for (const event of content.events) {
    if (event.who === undefined || event.who === 'hero') continue;
    if (event.followup_only || event.deck === 'backstory' || event.story !== undefined || event.actions || event.once === 'life') continue;
    if (event.once === 'game' && Object.hasOwn(state.lastFired, event.id)) continue;
    if (event.cooldown_days !== undefined && Object.hasOwn(state.lastFired, event.id) && state.day - (state.lastFired[event.id] ?? 0) < event.cooldown_days) continue;
    const weight = eventWeight(ctx, event, person);
    if (weight > 0) pool.push({ event, weight, given: {} });
  }
  return pool;
}

/**
 * The roll of the day for the whole circle (D-166): one chance, then one living person of the circle other than the
 * hero, then an event that fits them. The event is carried out at once by `runNpcEvent`; the pace of the hero's
 * narrator (gaps, tension) is not touched.
 */
function rollNpcEvent(ctx: Ctx, pace: NarratorContent): void {
  const { state } = ctx;
  if (!pace.npcChancePer10k || !chancePer(state.rng, pace.npcChancePer10k, 10000)) return;
  const people = state.circle.flatMap((id) => {
    const c = id === state.playerId ? undefined : findCharacter(state, id);
    return c && c.deathDay === null ? [c] : [];
  });
  if (people.length === 0) return;
  const person = pick(state.rng, people);
  const pool = npcPool(ctx, person);
  if (pool.length === 0) return;
  const { event } = pickFrom(ctx, pool);
  if (!runNpcEvent(ctx, event, person)) return;
  // Only what the event itself asks for is remembered, so that a both-event of the hero is not held back by it.
  if (event.once === 'game' || event.cooldown_days !== undefined) state.lastFired[event.id] = state.day;
}

/**
 * The narrator (D-045, D-230): during the hero's action it starts, in this order, the follow-ups due today, then —
 * if the pace allows — an event of an open story, then one of the main deck. Last phase of the day, so an event
 * never fires on the day an action ends.
 */
export const narratorPhase: DayPhase = {
  id: 'narrator',
  run(ctx) {
    const { state } = ctx;
    const pace = narratorContent(ctx.content);
    if (!state.pendingEvent) rollNpcEvent(ctx, pace);
    const active = state.activeAction;
    if (!active) return false;
    syncLife(state);
    const hero = getPlayer(state);
    const days = nominalDays(ctx, active.actionId);
    const long = isLong(pace, days);
    if (state.seenActionEnd !== active.endDay) {
      state.seenActionEnd = active.endDay;
      if (long) state.narratorStats.longActions += 1;
      else state.narratorStats.shortActions += 1;
    }
    const bottom = atBottom(ctx, pace, hero);

    // 1. Follow-ups due today go first, whatever the pace.
    // A quiet notice is carried out at once: the rest of today's follow-ups still start, but the deck waits for tomorrow.
    let carriedOut = false;
    for (const due of dueEvents(ctx)) {
      const protagonist = findCharacter(state, due.protagonist);
      if (!protagonist || protagonist.deathDay !== null) continue;
      const result = launch(ctx, pace, findEvent(ctx.content, due.eventId), protagonist, long, due.given);
      if (result === 'waiting') return true;
      if (result === 'done') carriedOut = true;
    }
    if (carriedOut) return false;

    if (state.lastEventDay !== null && state.day - state.lastEventDay < pace.minDaysBetweenEvents) return false;

    // 2. After a long time at the bottom one way-up event is due outside the usual chance (D-017).
    if (bottom && pace.bottom && state.bottomSince !== null) {
      const since = Math.max(state.bottomSince, state.lastWayUpDay ?? 0);
      if (state.day - since >= pace.bottom.forceAfterDays) {
        const wayUp = candidates(ctx, pace, hero, true).deck.filter((c) => c.event.tags?.includes('way_up'));
        // If it cannot be started after all, today has no event: the usual roll is not made.
        if (wayUp.length > 0) return launch(ctx, pace, pickFrom(ctx, wayUp).event, hero, long) === 'waiting';
      }
    }

    // 3. The chance of the day, by the length of the action (D-168).
    if (!chancePer(state.rng, long ? (pace.longActionChancePer10k ?? pace.eventChancePer10k) : pace.eventChancePer10k, 10000)) return false;

    // 4. Events of open stories first, then the deck.
    const { deck, stories } = candidates(ctx, pace, hero, bottom);
    const pool = stories.length > 0 ? stories : deck;
    if (pool.length === 0) return false;
    const chosen = pickFrom(ctx, pool);
    return launch(ctx, pace, chosen.event, hero, long, chosen.given) === 'waiting';
  },
};
