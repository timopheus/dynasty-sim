import { findCharacter } from '../helpers';
import type { NewGameHook, SuccessionHook } from '../state';
import { houseOf, makeHouse, openHead } from './house';

/**
 * Code of the house module that runs as a hook. A file a succession hook lives in never imports lifecycle.ts (import
 * cycle); a new character comes from `createCharacter` of hooks.ts.
 */

/** The house of the founder, with the founder as its first head. Runs after the circle, before the family (game.ts). */
export const houseOnNewGame: NewGameHook = (ctx) => {
  const founder = findCharacter(ctx.state, ctx.state.playerId);
  if (!founder) return;
  const house = makeHouse(ctx, founder.surname);
  founder.house = house.id;
  openHead(ctx.state, house, founder);
};

/** A new head without a house (the placeholder heir, D-007) takes the house of the dead one; then they lead it. */
export const houseOnSuccession: SuccessionHook = ({ state }, deceased, heir) => {
  if (heir.house === null) heir.house = deceased.house;
  const house = houseOf(state, heir);
  if (house) openHead(state, house, heir);
};
