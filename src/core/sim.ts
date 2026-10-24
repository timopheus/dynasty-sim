import { botCommand } from './bot';
import { BOT_STREAMS, type BotCharacter } from './bots/characters';
import { formatDate, fromYmd, START_YEAR, toYmd } from './time/calendar';
import type { Content } from './content/schema';
import { apply, MAX_WAIT_DAYS, newGame, timeRuns } from './game';
import { checkInvariants } from './invariants';
import type { GameState } from './state';
import { seedRng } from './rng';

export interface SimOptions {
  seed: number;
  years: number;
  /** Character of the bot (D-319); `random` by default, the player this run always had. */
  bot?: BotCharacter;
}

/** Steps in a row that may pass without time moving: pages of an event, scenes of the backstory. More is a hang. */
export const MAX_STEPS_WITHOUT_TIME = 50;

export interface SimResult {
  state: GameState;
  steps: number;
  violations: string[];
  /** Calendar year the house came to an end (status `ended`, D-315); null if it lasted the run. */
  endYear: number | null;
  /** How often each answer was chosen: `<eventId>/<page or ->/<option>` for events, `action/<id>` for actions (bot report, D-319). */
  choices: Record<string, number>;
}

/** Headless run: a bot plays until the given number of years has passed or the house ends (D-315). */
export function runSim(content: Content, { seed, years, bot = 'random' }: SimOptions): SimResult {
  if (!Number.isInteger(years) || years < 1) throw new Error(`years must be a positive integer, got ${years}`);
  const state = newGame(seed, content);
  const botRng = seedRng(seed, BOT_STREAMS[bot]);
  const endDay = fromYmd(START_YEAR + years, 1, 1);
  const violations = checkInvariants(state, content);
  let steps = 0;
  let still = 0;
  const choices: Record<string, number> = {};
  while (state.day < endDay && violations.length === 0 && state.status !== 'ended') {
    const prevDay = state.day;
    const key = choiceKey(state);
    const cmd = botCommand(state, content, botRng, bot);
    if (cmd.type === 'start') choices[`action/${cmd.actionId}`] = (choices[`action/${cmd.actionId}`] ?? 0) + 1;
    else if (cmd.type === 'choose' && key) choices[`${key}/${cmd.option}`] = (choices[`${key}/${cmd.option}`] ?? 0) + 1;
    apply(state, content, cmd);
    // A started action and its days are one step, as before D-439: invariants are checked once per decision.
    const waited = cmd.type === 'wait' || timeRuns(state);
    if (cmd.type !== 'wait' && timeRuns(state)) apply(state, content, { type: 'wait', days: MAX_WAIT_DAYS });
    steps += 1;
    // Only `wait` moves time (D-439), and it always does; other commands leave it where it was.
    if (state.day > prevDay) still = 0;
    else if (waited) violations.push(`step ${steps}: time did not advance from day ${prevDay}`);
    else if (++still > MAX_STEPS_WITHOUT_TIME) violations.push(`step ${steps}: ${still} choices in a row without time moving from day ${prevDay}`);
    for (const v of checkInvariants(state, content)) violations.push(`step ${steps}, ${formatDate(state.day)}: ${v}`);
  }
  return { state, steps, violations, endYear: state.status === 'ended' ? toYmd(state.day).year : null, choices };
}

/** Key of the scene on the screen: event and page; null without a pending event. */
function choiceKey(state: GameState): string | null {
  const p = state.pendingEvent;
  return p ? `${p.eventId}/${p.page ?? '-'}` : null;
}
