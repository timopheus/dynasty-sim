import type { DayPhase, NewGameHook, SuccessionHook } from '../state';

/** New game (S.9a): the founder starts from the base of happiness. Without `mind` in the content, nothing. */
export const mindOnNewGame: NewGameHook = ({ state, content }) => {
  if (content.mind) state.mind.happiness = content.mind.happiness.base;
};

/**
 * A new head (D-461): happiness is the hero's alone, so the heir starts from the base, whatever the deceased felt. A
 * hook of SUCCESSION_HOOKS: this file never imports lifecycle.ts.
 */
export const mindOnSuccession: SuccessionHook = ({ state, content }) => {
  if (content.mind) state.mind.happiness = content.mind.happiness.base;
};

/**
 * The day phase of happiness (S.9a slot, after the economy): S.10 pulls happiness toward the base once a month and
 * breaks the hero at the bottom of the range. Returns false: it never stops time by itself yet.
 */
export const mindPhase: DayPhase = {
  id: 'mind',
  run() {
    return false;
  },
};
