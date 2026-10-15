/**
 * Assembly file (D-052): new game, player commands and the day loop. The player
 * picks an action with a duration, then time runs day by day through the phases
 * of DAY_PHASES until a decision is needed.
 */
import { actionEndPhase, startAction } from './actions/actions';
import { log } from './chronicle/log';
import type { Content } from './content/schema';
import { chooseOption, eventPhase } from './events/events';
import { deathPhase, healthPhase } from './health/phases';
import { createCharacter } from './lifecycle';
import { relationsPhase } from './relations/relations';
import { isValidSeed, pick } from './rng';
import { initialState, type Ctx, type DayPhase, type GameState } from './state';
import { newDayPhase, scheduledPhase } from './time/time';
import { worldPhase } from './world/world';

export type Command = { type: 'start'; actionId: string } | { type: 'choose'; option: number };

/**
 * Day order (D-053). A phase returning true ends the run: death, the end of the
 * action and a fired event each hand control back to the player. Events never
 * fire on the end day, so every command moves time forward by at least one day.
 */
export const DAY_PHASES: readonly DayPhase[] = [
  newDayPhase,
  scheduledPhase,
  healthPhase,
  deathPhase,
  worldPhase,
  relationsPhase,
  actionEndPhase,
  eventPhase,
];

export function newGame(seed: number, content: Content): GameState {
  if (!isValidSeed(seed)) throw new Error(`Invalid seed ${seed}`);
  const state = initialState(seed);
  const ctx: Ctx = { state, content };
  const surname = pick(state.rng, content.names.surnames);
  const founder = createCharacter(ctx, { surname, age: content.settings.startAge });
  founder.money = content.settings.startMoney;
  state.playerId = founder.id;
  log(state, { subject: founder, kind: 'start', level: 'chronicle', template: content.settings.texts.start });
  return state;
}

/** Applies a player command and runs time forward to the next decision. Mutates state. */
export function apply(state: GameState, content: Content, cmd: Command): void {
  const ctx: Ctx = { state, content };
  if (cmd.type === 'start') startAction(ctx, cmd.actionId);
  else chooseOption(ctx, cmd.option);
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
