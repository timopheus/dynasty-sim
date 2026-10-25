/**
 * Assembly file (D-052): new game, player commands and the day loop. The player
 * picks an action with a duration; time runs day by day through the phases of
 * DAY_PHASES only on the command `wait` (D-439), up to its number of days or
 * until a decision is needed.
 */
import { actionEndPhase, startAction } from './actions/actions';
import { archivePhase } from './archive/phases';
import { backstoryAfterChoice, backstoryOnNewGame } from './backstory/phases';
import { log } from './chronicle/log';
import type { Content } from './content/schema';
import { chooseOption } from './events/events';
import { familyOnNewGame, familyPhase, proposeCommand, type ProposeOrder } from './family/phases';
import { economyPhase } from './economy/phases';
import { deathPhase, healthPhase } from './health/phases';
import { createCharacter } from './hooks';
import { houseOnNewGame } from './house/phases';
import { mindOnNewGame, mindPhase } from './mind/phases';
import { narratorPhase } from './narrator/phases';
import { placeOnNewGame, placePhase } from './place/phases';
import { relationsPhase } from './relations/relations';
import { isValidSeed, pick } from './rng';
import { initialState, type AfterChoiceHook, type Ctx, type DayPhase, type GameState, type NewGameHook } from './state';
import { storiesPhase } from './stories/phases';
import { endHouse, successionPhase, willCommand, type WillOrder } from './succession/phases';
import { summaryPhase } from './summary/phases';
import { newDayPhase, scheduledPhase } from './time/time';
import { worldOnNewGame, worldPhase } from './world/phases';

/**
 * Player commands. `end`: the player ends the house (D-315). `will`: a will at the notary (D-236, D-314; succession/).
 * `propose`: a proposal of marriage from the page of a person (D-313; family/). `wait`: lets up to `days` days pass,
 * stopping earlier at a decision (D-439); no other command moves time. `start` of an action with `target: place` names
 * the place a journey leads to (S.9a, D-462).
 */
export type Command =
  | { type: 'start'; actionId: string; target?: string }
  | { type: 'choose'; option: number }
  | { type: 'wait'; days: number }
  | { type: 'end' }
  | ({ type: 'will' } & WillOrder)
  | ({ type: 'propose' } & ProposeOrder);

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
  familyPhase,
  successionPhase,
  relationsPhase,
  economyPhase,
  mindPhase,
  summaryPhase,
  archivePhase,
  placePhase,
  actionEndPhase,
  storiesPhase,
  narratorPhase,
];

/**
 * New game, after the founder and the `start` line (D-167): the circle, the house and the living kin of the founder
 * (stage 4), the places and the hero's happiness (S.9a), then the backstory of the founder.
 */
const NEW_GAME_HOOKS: readonly NewGameHook[] = [worldOnNewGame, houseOnNewGame, familyOnNewGame, placeOnNewGame, mindOnNewGame, backstoryOnNewGame];

/** After a choice that left no event waiting: the next scene of the backstory (3.11). */
const AFTER_CHOICE_HOOKS: readonly AfterChoiceHook[] = [backstoryAfterChoice];

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

/** Most days one `wait` may let pass: a hundred years. `play` waits this long, i.e. until the next decision. */
export const MAX_WAIT_DAYS = 36525;

/**
 * Applies a player command. Mutates state. Only `wait` moves time (D-439): `start` and `will` begin an action and
 * leave the game `running`; a choice that ends an event lets the after-choice hooks start the next scene of the
 * backstory, then the game is `running` if the hero still has an action, else it waits for one (also after the hero's
 * death inside the choice). The next page of an event and the scenes of the backstory wait for the player.
 * A house that has ended takes no command (D-315); `end` ends it; `will` and `propose` go to their modules.
 */
export function apply(state: GameState, content: Content, cmd: Command): void {
  const ctx: Ctx = { state, content };
  if (hasEnded(state)) throw new Error('The house has come to an end: no more commands');
  if (cmd.type === 'end') {
    endHouse(ctx);
    return;
  }
  if (cmd.type === 'propose') {
    // The answer is an event: it waits for the player.
    proposeCommand(ctx, { suitor: cmd.suitor, target: cmd.target });
    return;
  }
  if (cmd.type === 'wait') {
    waitDays(ctx, cmd.days);
    return;
  }
  // The will starts the action at the notary (4.6), as `start` starts any other.
  if (cmd.type === 'will') willCommand(ctx, { heir: cmd.heir, guardian: cmd.guardian, items: cmd.items });
  else if (cmd.type === 'start') startAction(ctx, cmd.actionId, cmd.target ?? null);
  else {
    chooseOption(ctx, cmd.option);
    // Nobody inherited a hero who died in the choice.
    if (hasEnded(state)) return;
    if (state.pendingEvent) return;
    for (const hook of AFTER_CHOICE_HOOKS) hook(ctx);
    if (state.pendingEvent) return;
  }
  state.status = state.activeAction ? 'running' : 'awaiting_action';
}

/** The game waits for `wait`: an action is under way and no decision is pending. */
export function timeRuns(state: GameState): boolean {
  return state.status === 'running';
}

/**
 * A command, then the days until the next decision, as one step of the old loop: for the bot, runs, tests and the
 * screen until the clock of the slice (S.8) lets the player pause and speed time himself.
 */
export function play(state: GameState, content: Content, cmd: Command): void {
  apply(state, content, cmd);
  if (timeRuns(state)) apply(state, content, { type: 'wait', days: MAX_WAIT_DAYS });
}

/** A function, not an inline test: commands change the status behind the back of the type checker. */
function hasEnded(state: GameState): boolean {
  return state.status === 'ended';
}

/**
 * Up to `days` whole days through DAY_PHASES (D-439). A phase that returns true (death, the end of the action, a fired
 * event) ends the run at once; so N waits of one day and one wait of N days give the same game.
 */
function waitDays(ctx: Ctx, days: number): void {
  if (!Number.isInteger(days) || days < 1 || days > MAX_WAIT_DAYS) throw new Error(`wait takes 1…${MAX_WAIT_DAYS} days, got ${String(days)}`);
  if (!timeRuns(ctx.state)) throw new Error(`Cannot wait while ${ctx.state.status}`);
  for (let day = 0; day < days; day++) {
    for (const phase of DAY_PHASES) {
      if (phase.run(ctx)) return;
    }
  }
}
