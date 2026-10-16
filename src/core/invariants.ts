/**
 * Assembly file (D-052): consistency rules of all modules. Runs after every
 * command in headless runs and tests; a new rule goes into its module's list.
 */
import { actionsInvariants } from './actions/actions';
import { characterInvariants } from './character/character';
import { chronicleInvariants } from './chronicle/log';
import type { Content } from './content/schema';
import { eventsInvariants } from './events/events';
import { healthInvariants } from './health/health';
import { relationsInvariants } from './relations/relations';
import { SAVE_VERSION } from './save/version';
import { isInt } from './helpers';
import type { GameState, Invariant } from './state';
import { timeInvariants } from './time/time';
import { worldInvariants } from './world/world';

const coreInvariants: Invariant = ({ state }) => {
  const problems: string[] = [];
  if (state.version !== SAVE_VERSION) problems.push(`unsupported save version ${String(state.version)}`);
  if (!isInt(state.day)) problems.push(`day is not an integer: ${state.day}`);
  if (!Array.isArray(state.rng) || state.rng.length !== 4 || !state.rng.every(isInt)) {
    problems.push('rng state is not four integers');
  }
  if (state.status === 'awaiting_action') {
    if (state.activeAction !== null || state.pendingEvent !== null) {
      problems.push('awaiting_action with an active action or pending event');
    }
  } else if (state.status === 'awaiting_choice') {
    if (!state.activeAction || !state.pendingEvent) problems.push('awaiting_choice without an action and event');
  } else {
    problems.push(`unknown status ${String(state.status)}`);
  }
  return problems;
};

const INVARIANTS: readonly Invariant[] = [
  coreInvariants,
  characterInvariants,
  healthInvariants,
  timeInvariants,
  actionsInvariants,
  eventsInvariants,
  worldInvariants,
  relationsInvariants,
  chronicleInvariants,
];

/** Returns a list of broken rules; empty means the state is consistent. */
export function checkInvariants(state: GameState, content: Content): string[] {
  return INVARIANTS.flatMap((check) => check({ state, content }));
}
