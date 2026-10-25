import { newId } from '../helpers';
import type { DayPhase, NewGameHook } from '../state';
import { placeIdOf } from './place';

/**
 * New game (S.9a): a record with a permanent id `p…` for every place of the content, in its order, and the hero in the
 * starting place. Without places in the content it does nothing and takes no id. No randomness.
 */
export const placeOnNewGame: NewGameHook = (ctx) => {
  const { state, content } = ctx;
  const places = content.places;
  if (!places) return;
  for (const p of places.list) state.place.places.push({ id: newId(state, 'p'), key: p.id });
  state.place.here = placeIdOf(state, places.start);
};

/**
 * Arrival (S.9a): on the last day of a road, before the end of the action (`actionEndPhase`, right after this phase in
 * DAY_PHASES), the hero is in the place the road led to. A road broken off (`interruptRequest`) leaves him where he
 * set out from. Returns false: the end of the action hands control back. S.9 writes the line of arrival here.
 */
export const placePhase: DayPhase = {
  id: 'place',
  run(ctx) {
    const { state } = ctx;
    const active = state.activeAction;
    if (!active || active.target === null || state.interruptRequest || state.day < active.endDay) return false;
    state.place.here = active.target;
    return false;
  },
};
