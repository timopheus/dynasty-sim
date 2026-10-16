import type { AfterChoiceHook, NewGameHook } from '../state';

/**
 * New game hook (D-167): brings the founder to the neutral base and starts the first scene of the backstory.
 * Runs after the circle is filled (worldOnNewGame). Stub of 3.1: does nothing.
 */
export const backstoryOnNewGame: NewGameHook = () => {};

/**
 * After a choice that left no event waiting (game.ts): starts the next scene of the backstory, or ends it with the
 * line "went out into the world" (D-167). Must do nothing outside the backstory and for an heir. Stub of 3.1e.
 */
export const backstoryAfterChoice: AfterChoiceHook = () => {};
