import { personValues, placeholderValues } from '../character/text';
import { log } from '../chronicle/log';
import { refreshBoards } from '../contracts/board';
import { eventWeight, fireEvent } from '../events/events';
import type { EventDef } from '../events/content';
import { findCharacter, getPlayer } from '../helpers';
import { kill } from '../lifecycle';
import { chancePer, int, pick, seedRng, weightedPick } from '../rng';
import type { AfterChoiceHook, Character, Ctx, DayPhase, NewGameHook } from '../state';
import { fillTemplate } from '../text/text';
import { EARLY_YEARS, type ParentFate } from './backstory';
import { START_AGE_MIN, VANISHED, type BackstoryContent, type BackstoryStage } from './content';
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

export { EARLY_YEARS };

/** Draws `count` of the variants of the stage's offer by chance (D-167), kept in the order of the content. */
function drawOffer(ctx: Ctx, stage: BackstoryStage): void {
  const { state } = ctx;
  if (!stage.offer) return;
  const left = [...stage.offer.variants];
  const drawn = new Set<string>();
  while (drawn.size < stage.offer.count) drawn.add(left.splice(left.indexOf(pick(state.rng, left)), 1)[0] as string);
  state.backstory.offered.push(...stage.offer.variants.filter((v) => drawn.has(v)));
}

/** Stream of the fates of the parents in `seedRng(seed, stream)` (D-481): the world stream is not touched. */
const FATES_STREAM = 0x46415445;

/**
 * Draws the fates of the founder's parents at his birth (D-481): for each parent alive, father first, a day of the
 * childhood between the ages of `fates.ages`, a disappearance with `missingPct` percent, else a death with a cause of
 * `fates.causes`. From a stream of its own: the world is the same whatever the fates.
 */
function drawFates(ctx: Ctx, founder: Character, fates: NonNullable<BackstoryContent['fates']>): ParentFate[] {
  const { state } = ctx;
  const rng = seedRng(state.seed, FATES_STREAM);
  const out: ParentFate[] = [];
  const lo = Math.max(state.day + 1, shiftYears(founder.birthDay, fates.ages.min));
  const hi = Math.max(lo, shiftYears(founder.birthDay, fates.ages.max + 1) - 1);
  for (const id of [founder.father, founder.mother]) {
    const parent = id === null ? null : findCharacter(state, id);
    if (!parent || parent.deathDay !== null) continue;
    const day = int(rng, lo, hi);
    const missing = chancePer(rng, fates.missingPct, 100);
    out.push({ person: parent.id, day, kind: missing ? 'missing' : 'death', cause: missing ? VANISHED : pick(rng, fates.causes), done: false });
  }
  return out;
}

/**
 * Carries out the fates of the parents whose day has come (D-481): the line about the founder, dated today, then the
 * death with its cause (a disappearance is a death with the cause `vanished`). A parent who died before keeps that death.
 */
function runFates(ctx: Ctx): void {
  const { state, content } = ctx;
  const fates = content.backstory?.fates;
  const founder = state.backstory.founder === null ? null : findCharacter(state, state.backstory.founder);
  for (const f of state.backstory.fates) {
    if (f.done || f.day > state.day) continue;
    f.done = true;
    const parent = findCharacter(state, f.person);
    if (!fates || !founder || !parent || parent.deathDay !== null) continue;
    const key = `${parent.sex === 'male' ? 'father' : 'mother'}_${f.kind === 'missing' ? 'vanished' : 'died'}` as const;
    const parts = fillTemplate(fates.texts[key], { ...placeholderValues(founder, state.day), ...personValues('parent', parent) });
    log(ctx, { subject: founder, kind: 'backstory_fate', level: 'chronicle', parts });
    kill(ctx, parent, f.cause ?? VANISHED);
  }
}

/** Ends the backstory with the line "went out into the world", dated today (D-167, D-479), and fills the boards. */
function goOut(ctx: Ctx, leave: string): void {
  const { state } = ctx;
  const st = state.backstory;
  // every fate falls before START_AGE_MIN (checkBackstory); one put off by a stopped day comes now, not never
  runFates(ctx);
  st.running = false;
  st.next = null;
  log(ctx, { subject: getPlayer(state), kind: 'backstory_end', level: 'chronicle', template: leave });
  // the boards within reach are there on the day he goes out, as in a new month (no boards in the childhood, D-480)
  refreshBoards(ctx);
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

/**
 * The founder waits for `day` in the hidden action `early_years`: time runs until the day of the scene (D-439). An
 * occupation of his own under way (after an illness broke off the early years) is never replaced: the scene still comes
 * on its day, the backstory phase looks at the day, not at the action.
 */
function waitFor(ctx: Ctx, day: number): void {
  const { state } = ctx;
  state.backstory.next = day;
  const active = state.activeAction;
  if (active !== null && active.actionId !== EARLY_YEARS) return;
  if (active?.endDay !== day) state.activeAction = { actionId: EARLY_YEARS, endDay: day, target: null, contract: null };
  if (!state.pendingEvent) state.status = 'running';
}

/**
 * Shows the scenes due today (D-479) until one waits for the player; when the next scene is on a later day,
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
  founder.birthDay = ctx.state.day;
  founder.baseStats = { ...bs.base };
  founder.traits = [];
  // the fates of the parents are drawn at the birth (D-481)
  const fates = bs.fates ? drawFates(ctx, founder, bs.fates) : [];
  ctx.state.backstory = { running: true, founder: founder.id, stage: 0, inStage: 0, offered: [], played: [], dates: [], next: null, notBefore: 0, fates };
  advanceOnClock(ctx);
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
  advanceOnClock(ctx);
};

/** The founder is no longer the hero: the backstory is dropped, heirs never live through it. */
function drop(ctx: Ctx): void {
  const { state } = ctx;
  const st = state.backstory;
  st.running = false;
  st.next = null;
  // a stage waited for and never begun leaves no date
  st.dates = st.dates.filter((d) => d <= state.day);
  if (state.activeAction?.actionId === EARLY_YEARS) {
    state.activeAction = null;
    if (state.status === 'running') state.status = 'awaiting_action';
  }
}

/**
 * The day phase of the backstory (D-479): on the day the founder waits for it starts the scene and stops the day, as
 * the narrator does, or writes the line "went out into the world" and hands the choice of an action to the player.
 * Comes before the end of the action, so `early_years` ends here and not as an action.
 */
export const backstoryPhase: DayPhase = {
  id: 'backstory',
  run(ctx) {
    const { state, content } = ctx;
    const st = state.backstory;
    if (!st.running || !content.backstory) return false;
    const hero = findCharacter(state, state.playerId);
    if (!hero || hero.id !== st.founder || hero.deathDay !== null) {
      drop(ctx);
      return state.status !== 'running';
    }
    runFates(ctx);
    if (st.next === null || st.next > state.day || state.pendingEvent) return false;
    // an occupation of his own that ends today ends first (the phase of the end of the action comes later); the scene comes tomorrow
    const own = state.activeAction;
    if (own !== null && own.actionId !== EARLY_YEARS && own.endDay <= state.day) return false;
    advanceOnClock(ctx);
    if (state.pendingEvent) return true;
    if (st.running) return false;
    // the backstory is over: the player chooses the first action; an occupation of his own goes on
    if (state.activeAction !== null) return false;
    state.status = 'awaiting_action';
    return true;
  },
};
