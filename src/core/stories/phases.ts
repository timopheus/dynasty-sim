import type { DayPhase } from '../state';

/**
 * Stories phase (3.8): closes stories whose time is up with a fallback ending. Starting an event from a story
 * lives here (this file may import events/), never in stories/effects.ts. Stub of 3.1: does nothing.
 */
export const storiesPhase: DayPhase = {
  id: 'stories',
  run() {
    return false;
  },
};
