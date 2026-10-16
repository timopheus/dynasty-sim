import { availableActions } from './actions/actions';
import type { Content } from './content/schema';
import { pendingEventDef } from './events/events';
import type { Command } from './game';
import { int, pick, type RngState } from './rng';
import type { GameState } from './state';

/**
 * Random player for headless runs. It has its own generator so its choices do
 * not shift the world's random sequence, and that generator is not saved.
 */
export function botCommand(state: GameState, content: Content, rng: RngState): Command {
  const event = pendingEventDef(state, content);
  if (event) return { type: 'choose', option: int(rng, 0, event.options.length - 1) };
  return { type: 'start', actionId: pick(rng, availableActions({ state, content })).id };
}
