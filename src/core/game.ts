/**
 * Assembly file (D-052): new game, player commands and the day loop. The player
 * picks an action with a duration, then time runs day by day through the phases
 * of DAY_PHASES until a decision is needed.
 */
import { actionEndPhase, startAction } from './actions/actions';
import { backstoryOnNewGame } from './backstory/phases';
import { log } from './chronicle/log';
import type { Content } from './content/schema';
import { chooseOption } from './events/events';
import { deathPhase, healthPhase } from './health/phases';
import { createCharacter } from './lifecycle';
import { narratorPhase } from './narrator/phases';
import { relationsPhase } from './relations/relations';
import { isValidSeed, pick } from './rng';
import { initialState, type Ctx, type DayPhase, type GameState, type NewGameHook } from './state';
import { storiesPhase } from './stories/phases';
import { newDayPhase, scheduledPhase } from './time/time';
import { worldOnNewGame, worldPhase } from './world/phases';

export type Command = { type: 'start'; actionId: string } | { type: 'choose'; option: number };

/**
 * Day order (D-053). A phase returning true ends the run: death, the end of the
 * action and a fired event each hand control back to the player. Events never
 * fire on the end day, so an action moves time forward by at least one day.
 */
export const DAY_PHASES: readonly DayPhase[] = [
  newDayPhase,
  scheduledPhase,
  healthPhase,
  deathPhase,
  worldPhase,
  relationsPhase,
  actionEndPhase,
  storiesPhase,
  narratorPhase,
];

/** New game, after the founder and the `start` line (D-167): the circle, then the backstory of the founder. */
const NEW_GAME_HOOKS: readonly NewGameHook[] = [worldOnNewGame, backstoryOnNewGame];

export function newGame(seed: number, content: Content): GameState {
  if (!isValidSeed(seed)) throw new Error(`Invalid seed ${seed}`);
  const state = initialState(seed);
  const ctx: Ctx = { state, content };
  const surname = pick(state.rng, content.names.surnames);
  const founder = createCharacter(ctx, { surname, age: content.settings.startAge });
  founder.money = content.settings.startMoney;
  state.playerId = founder.id;
  log(ctx, { subject: founder, kind: 'start', level: 'chronicle', template: content.settings.texts.start });
  for (const hook of NEW_GAME_HOOKS) hook(ctx);
  return state;
}

/**
 * Applies a player command and runs time forward to the next decision. Mutates state. After a choice the days run
 * only if no choice waits any more and the hero has an action: the next page of an event and the scenes of the
 * backstory wait for the player without time passing; without an action (a scene, or the hero's death inside the
 * choice) the player picks one.
 */
export function apply(state: GameState, content: Content, cmd: Command): void {
  const ctx: Ctx = { state, content };
  if (cmd.type === 'start') startAction(ctx, cmd.actionId);
  else {
    chooseOption(ctx, cmd.option);
    if (state.pendingEvent) return;
    if (!state.activeAction) {
      state.status = 'awaiting_action';
      return;
    }
  }
  runUntilDecision(ctx);
}

function runUntilDecision(ctx: Ctx): void {
  if (!ctx.state.activeAction) throw new Error('No active action');
  for (;;) {
    for (const phase of DAY_PHASES) {
      if (phase.run(ctx)) return;
    }
  }
}
