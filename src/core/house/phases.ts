import type { NewGameHook, SuccessionHook } from '../state';

/**
 * Code of the house module that runs as a hook (4.1 wires them, 4.7 fills them). A file a succession hook lives in
 * never imports lifecycle.ts (import cycle); a new character comes from `createCharacter` of hooks.ts.
 */

/** 4.7: the house of the founder. Runs after the circle, before the family (game.ts). */
export const houseOnNewGame: NewGameHook = () => {};

/** 4.7: a new head without a house (the placeholder heir, D-007) takes the house of the dead one. */
export const houseOnSuccession: SuccessionHook = () => {};
