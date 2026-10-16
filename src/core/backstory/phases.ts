import { log } from '../chronicle/log';
import { eventWeight, fireEvent } from '../events/events';
import type { EventDef } from '../events/content';
import { findCharacter, getPlayer } from '../helpers';
import { pick, weightedPick } from '../rng';
import type { AfterChoiceHook, Ctx, NewGameHook } from '../state';
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

/**
 * Starts scenes until one waits for the player; when the stages are over, writes the line "went out into the world"
 * and ends the backstory. A stage that has no scene to show is passed over.
 */
function advance(ctx: Ctx): void {
  const { state, content } = ctx;
  const bs = content.backstory;
  const st = state.backstory;
  if (!bs) return;
  while (st.running) {
    const stage = bs.stages[st.stage];
    if (!stage) {
      dateLines(ctx);
      st.running = false;
      st.lines = [];
      log(ctx, { subject: getPlayer(state), kind: 'backstory_end', level: 'chronicle', template: bs.texts.leave });
      return;
    }
    // The first line of the stage, for its date (D-324); a stage with no scene to show marks the same place.
    if (st.inStage === 0 && st.lines.length === st.stage + 1) st.lines.push(state.chronicle.length);
    if (st.inStage === 0 && stage.offer) {
      // The offer is drawn when the stage begins: `count` of the variants by chance (D-167), in the order of the content.
      const left = [...stage.offer.variants];
      const drawn = new Set<string>();
      while (drawn.size < stage.offer.count) drawn.add(left.splice(left.indexOf(pick(state.rng, left)), 1)[0] as string);
      st.offered.push(...stage.offer.variants.filter((v) => drawn.has(v)));
    }
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
 * Dates the lines of the backstory by age (D-324): from the founder's first line to the first stage — the day of
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
  founder.baseStats = { ...bs.base };
  founder.traits = [];
  const first = ctx.state.chronicle.findIndex((e) => e.kind === 'start' && e.subject === founder.id);
  const lines = [first === -1 ? ctx.state.chronicle.length : first];
  ctx.state.backstory = { running: true, founder: founder.id, stage: 0, inStage: 0, offered: [], played: [], lines };
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
  if (!hero || hero.id !== st.founder || hero.deathDay !== null) {
    st.running = false;
    st.lines = [];
    return;
  }
  advance(ctx);
};
