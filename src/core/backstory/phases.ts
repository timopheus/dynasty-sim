import { log } from '../chronicle/log';
import { eventWeight, fireEvent } from '../events/events';
import type { EventDef } from '../events/content';
import { findCharacter, getPlayer } from '../helpers';
import { pick, weightedPick } from '../rng';
import type { AfterChoiceHook, Ctx, NewGameHook } from '../state';

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
      st.running = false;
      log(ctx, { subject: getPlayer(state), kind: 'backstory_end', level: 'chronicle', template: bs.texts.leave });
      return;
    }
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
  ctx.state.backstory = { running: true, founder: founder.id, stage: 0, inStage: 0, offered: [], played: [] };
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
    return;
  }
  advance(ctx);
};
