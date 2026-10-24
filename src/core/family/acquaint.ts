import { findCharacter } from '../helpers';
import { introduce } from '../relations/acquaintance';
import type { Ctx } from '../state';
import { childrenOf, parentsOf, siblingsOf } from './kin';

/**
 * The hero knows their own family (D-037, S.4b): parents, brothers and sisters, the spouse and children are close.
 * `introduce` writes the acquaintance of the current player, so this runs for whoever is the head now: at the start,
 * at a succession, at a marriage and at a birth near the hero. Parents are introduced dead or alive (the head who
 * has just died is the heir's father); the rest only while alive, so the hot part keeps no more of the dead than the
 * hero's own parents. Never consumes randomness.
 */
export function introduceKin(ctx: Ctx): void {
  const { state } = ctx;
  const hero = state.playerId;
  for (const p of parentsOf(state, hero)) introduce(ctx, p.id, 'close');
  const living = [...siblingsOf(state, hero), ...childrenOf(state, hero)];
  const spouseId = findCharacter(state, hero)?.spouse ?? null;
  const spouse = spouseId === null ? null : findCharacter(state, spouseId);
  if (spouse) living.push(spouse);
  for (const c of living) if (c.deathDay === null) introduce(ctx, c.id, 'close');
}
