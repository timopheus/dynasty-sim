import { log } from '../chronicle/log';
import { eventWeight, fireEvent } from '../events/events';
import type { EventDef } from '../events/content';
import { findCharacter, getPlayer } from '../helpers';
import { int, pick, weightedPick } from '../rng';
import type { AfterChoiceHook, Ctx, DayPhase, NewGameHook } from '../state';
import { START_AGE_MIN, type BackstoryStage } from './content';
import { shiftYears } from './effects';

/** Scenes of a stage that can be shown now, with weights; never consumes randomness. */
function candidates(ctx: Ctx, stageId: string): { event: EventDef; weight: number }[] {
  const { state, content } = ctx;
  const hero = getPlayer(state);
  return content.events
    .filter((e) => e.deck === 'backstory' && e.stage === stageId && !state.backstory.played.includes(e.id))
    .map((event) => ({ event, weight: eventWeight(ctx, event, hero) }))
    .filter((c) => c.weight > 0);
}

/** The hidden action the founder waits in for the next scene (D-479): no events, never started by the player. */
export const EARLY_YEARS = 'early_years';

/** Draws `count` of the variants of the stage's offer by chance (D-167), kept in the order of the content. */
function drawOffer(ctx: Ctx, stage: BackstoryStage): void {
  const { state } = ctx;
  if (!stage.offer) return;
  const left = [...stage.offer.variants];
  const drawn = new Set<string>();
  while (drawn.size < stage.offer.count) drawn.add(left.splice(left.indexOf(pick(state.rng, left)), 1)[0] as string);
  state.backstory.offered.push(...stage.offer.variants.filter((v) => drawn.has(v)));
}

/** Ends the backstory with the line "went out into the world", dated today (D-167, D-479). */
function goOut(ctx: Ctx, leave: string): void {
  const { state } = ctx;
  const st = state.backstory;
  st.running = false;
  st.next = null;
  st.lines = [];
  log(ctx, { subject: getPlayer(state), kind: 'backstory_end', level: 'chronicle', template: leave });
}

/**
 * The old way (no `fromBirth`, until T.4): starts scenes until one waits for the player, all on the same day; when the
 * stages are over, dates the lines (D-324), writes the line "went out into the world" and ends the backstory. A stage
 * that has no scene to show is passed over.
 */
function advanceAtOnce(ctx: Ctx): void {
  const { state, content } = ctx;
  const bs = content.backstory;
  const st = state.backstory;
  if (!bs) return;
  while (st.running) {
    const stage = bs.stages[st.stage];
    if (!stage) {
      dateLines(ctx);
      goOut(ctx, bs.texts.leave);
      return;
    }
    // The first line of the stage, for its date (D-324); a stage with no scene to show marks the same place.
    if (st.inStage === 0 && st.lines.length === st.stage + 1) st.lines.push(state.chronicle.length);
    if (st.inStage === 0) drawOffer(ctx, stage);
    const pool = st.inStage < (stage.scenes ?? 1) ? candidates(ctx, stage.id) : [];
    if (pool.length === 0) {
      st.stage += 1;
      st.inStage = 0;
      continue;
    }
    const { event } = weightedPick(state.rng, pool, (c) => c.weight);
    st.played.push(event.id);
    st.inStage += 1;
    if (fireEvent(ctx, event, getPlayer(state)) === 'waiting') return;
  }
}

/**
 * The day the founder waits for next (D-479, D-445), from where the backstory stands: the first scene of a stage with
 * `age` falls on a day of the year the founder is of that age, by chance; a stage without `age` and the next scene of
 * the same stage come at once. Nothing comes before the years of study are over (`notBefore`), and the founder goes
 * out into the world when the stages are over, not before START_AGE_MIN. Records the date of a stage that begins.
 */
function nextDay(ctx: Ctx, stages: readonly BackstoryStage[]): number {
  const { state } = ctx;
  const st = state.backstory;
  const birth = getPlayer(state).birthDay;
  const soonest = Math.max(state.day, st.notBefore);
  const current = stages[st.stage];
  if (current && st.inStage >= (current.scenes ?? 1)) {
    st.stage += 1;
    st.inStage = 0;
  }
  const stage = stages[st.stage];
  if (!stage) return Math.max(soonest, shiftYears(birth, START_AGE_MIN));
  if (st.inStage > 0) return soonest;
  let day = soonest;
  if (stage.age !== undefined) {
    const lo = Math.max(soonest, shiftYears(birth, stage.age));
    const hi = shiftYears(birth, stage.age + 1) - 1;
    // the years of study may run past the year of the stage: the content check keeps it from happening
    day = lo > hi ? lo : int(state.rng, lo, hi);
  }
  st.dates.push(day);
  return day;
}

/** The founder waits for `day` in the hidden action `early_years`: time runs until the day of the scene (D-439). */
function waitFor(ctx: Ctx, day: number): void {
  const { state } = ctx;
  state.backstory.next = day;
  const active = state.activeAction;
  if (active?.actionId !== EARLY_YEARS || active.endDay !== day) state.activeAction = { actionId: EARLY_YEARS, endDay: day, target: null, contract: null };
  if (!state.pendingEvent) state.status = 'running';
}

/**
 * One clock (D-479): shows the scenes due today until one waits for the player; when the next scene is on a later day,
 * the founder waits for it in `early_years`; when the stages are over and the day has come, writes the line "went out
 * into the world", dated today, and ends the backstory. A stage that has no scene to show on its day is passed over.
 */
function advanceOnClock(ctx: Ctx): void {
  const { state, content } = ctx;
  const bs = content.backstory;
  const st = state.backstory;
  if (!bs) return;
  while (st.running) {
    st.next ??= nextDay(ctx, bs.stages);
    if (st.next > state.day) return waitFor(ctx, st.next);
    st.next = null;
    if (state.activeAction?.actionId === EARLY_YEARS) state.activeAction = null;
    const stage = bs.stages[st.stage];
    if (!stage) return goOut(ctx, bs.texts.leave);
    if (st.inStage === 0) drawOffer(ctx, stage);
    const pool = candidates(ctx, stage.id);
    if (pool.length === 0) {
      st.stage += 1;
      st.inStage = 0;
      continue;
    }
    const { event } = weightedPick(state.rng, pool, (c) => c.weight);
    st.played.push(event.id);
    st.inStage += 1;
    if (fireEvent(ctx, event, getPlayer(state)) === 'waiting') return;
  }
}

function advance(ctx: Ctx): void {
  if (ctx.content.backstory?.fromBirth) advanceOnClock(ctx);
  else advanceAtOnce(ctx);
}

/**
 * The old way only (until T.4). Dates the lines of the backstory by age (D-324): from the founder's first line to the first stage — the day of
 * birth (after every `age_years`); the lines of a stage with `age` — that birthday; of a stage without it — the start
 * of the game, today. No day passes in the world: only the dates of the lines change, they never fall and never
 * pass today. Spends no randomness.
 */
function dateLines(ctx: Ctx): void {
  const { state, content } = ctx;
  const st = state.backstory;
  const stages = content.backstory?.stages ?? [];
  const birth = Math.min(getPlayer(state).birthDay, state.day);
  const bounds = [...st.lines, state.chronicle.length];
  let day = birth;
  for (let k = 0; k + 1 < bounds.length; k++) {
    const age = k === 0 ? 0 : stages[k - 1]?.age;
    day = Math.max(day, age === undefined ? state.day : Math.min(state.day, shiftYears(birth, age)));
    for (let i = bounds[k] as number; i < (bounds[k + 1] as number); i++) (state.chronicle[i] as { day: number }).day = day;
  }
}

/**
 * New game hook (D-167): brings the founder to the neutral base — base stats, no traits, no education — and starts
 * the first scene of the backstory. Runs after the circle is filled (worldOnNewGame), so scenes find people for their
 * roles. Without the key `backstory` the founder stays as generated.
 */
export const backstoryOnNewGame: NewGameHook = (ctx) => {
  const bs = ctx.content.backstory;
  if (!bs) return;
  const founder = getPlayer(ctx.state);
  // one clock (D-479): the founder is born today, on the first day of the game, not some day of his first year
  if (bs.fromBirth) founder.birthDay = ctx.state.day;
  founder.baseStats = { ...bs.base };
  founder.traits = [];
  const first = ctx.state.chronicle.findIndex((e) => e.kind === 'start' && e.subject === founder.id);
  // on the clock no line is dated afterwards (D-479): each is dated the day it is written
  const lines = bs.fromBirth ? [] : [first === -1 ? ctx.state.chronicle.length : first];
  ctx.state.backstory = { running: true, founder: founder.id, stage: 0, inStage: 0, offered: [], played: [], lines, dates: [], next: null, notBefore: 0, fates: [] };
  advance(ctx);
};

/**
 * After a choice that left no event waiting (game.ts): starts the next scene of the backstory, or ends it with the
 * line "went out into the world" (D-167). Does nothing outside the backstory; if the founder is no longer the hero
 * the backstory is dropped — heirs never live through it.
 */
export const backstoryAfterChoice: AfterChoiceHook = (ctx) => {
  const { state } = ctx;
  const st = state.backstory;
  if (!st.running || state.pendingEvent) return;
  const hero = findCharacter(state, state.playerId);
  if (!hero || hero.id !== st.founder || hero.deathDay !== null) return drop(ctx);
  advance(ctx);
};

/** The founder is no longer the hero: the backstory is dropped, heirs never live through it. */
function drop(ctx: Ctx): void {
  const { state } = ctx;
  const st = state.backstory;
  st.running = false;
  st.lines = [];
  st.next = null;
  if (state.activeAction?.actionId === EARLY_YEARS) {
    state.activeAction = null;
    if (state.status === 'running') state.status = 'awaiting_action';
  }
}

/**
 * The day phase of the backstory (D-479): on the day the founder waits for it starts the scene and stops the day, as
 * the narrator does, or writes the line "went out into the world" and hands the choice of an action to the player.
 * Comes before the end of the action, so `early_years` ends here and not as an action. Only with `fromBirth`.
 */
export const backstoryPhase: DayPhase = {
  id: 'backstory',
  run(ctx) {
    const { state, content } = ctx;
    const st = state.backstory;
    if (!st.running || !content.backstory?.fromBirth) return false;
    const hero = findCharacter(state, state.playerId);
    if (!hero || hero.id !== st.founder || hero.deathDay !== null) {
      drop(ctx);
      return state.status !== 'running';
    }
    if (st.next === null || st.next > state.day || state.pendingEvent) return false;
    advanceOnClock(ctx);
    if (state.pendingEvent) return true;
    if (st.running) return false;
    // the backstory is over: the player chooses the first action
    state.activeAction = null;
    state.status = 'awaiting_action';
    return true;
  },
};
