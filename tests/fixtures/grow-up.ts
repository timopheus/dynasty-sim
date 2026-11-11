import type { Content } from '../../src/core/content/schema';
import { eventView } from '../../src/core/events/view';
import { apply } from '../../src/core/game';
import type { GameState } from '../../src/core/state';

/**
 * Lives the founder's childhood on the clock (D-479, T.4): answers each scene with its first open option and lets the
 * years run between them, until the backstory is over and the hero, 16 or older, is free to act. Tests of grown-up
 * mechanics on the real content start here: a new game opens with a newborn.
 */
export function growUp(state: GameState, content: Content): GameState {
  let guard = 0;
  while (state.backstory.running || state.status === 'awaiting_choice') {
    if (++guard > 10000) throw new Error('the backstory does not end');
    if (state.status === 'running') apply(state, content, { type: 'wait', days: 3650 });
    else if (state.status === 'awaiting_choice') apply(state, content, { type: 'choose', option: eventView({ state, content })!.options.find((o) => o.available)!.index });
    else break;
  }
  return state;
}

/**
 * The content with no backstory: the founder is made grown, at `settings.startAge`, on the first day, as before the
 * clock (T.4). For tests of grown-up mechanics that need fixed dates from 1 January 1700.
 */
export function withoutBackstory(content: Content): Content {
  return { ...content, backstory: null, events: content.events.filter((e) => e.deck !== 'backstory') };
}
