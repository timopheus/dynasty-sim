import { availableActions } from './actions/actions';
import type { Content } from './content/schema';
import { eventView } from './events/view';
import type { Command } from './game';
import { pick, type RngState } from './rng';
import type { GameState } from './state';

/**
 * Random player for headless runs. It has its own generator so its choices do
 * not shift the world's random sequence, and that generator is not saved.
 * In an event it picks only among the options the player could press.
 */
export function botCommand(state: GameState, content: Content, rng: RngState): Command {
  const view = eventView({ state, content });
  if (view) return { type: 'choose', option: pick(rng, view.options.filter((o) => o.available)).index };
  return { type: 'start', actionId: pick(rng, availableActions({ state, content })).id };
}
