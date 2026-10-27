import { newId } from '../helpers';
import type { DayPhase, NewGameHook } from '../state';
import { arrive, placeIdOf, setHere } from './place';

/**
 * New game (S.9a): a record with a permanent id `p…` for every place of the content, in its order, and the hero in the
 * starting place. Without places in the content it does nothing and takes no id. No randomness.
 */
export const placeOnNewGame: NewGameHook = (ctx) => {
  const { state, content } = ctx;
  const places = content.places;
  if (!places) return;
  for (const p of places.list) state.place.places.push({ id: newId(state, 'p'), key: p.id });
  const start = placeIdOf(state, places.start);
  if (start !== null) setHere(ctx, start);
};

/**
 * Arrival (S.9a, D-462): on the last day of a journey, before the end of the action (`actionEndPhase`, right after this
 * phase in DAY_PHASES), the hero is in the place it led to. A journey broken off (`interruptRequest`) is stopped by the
 * end of the action: he stands where the days have brought him (`stopJourney`). Returns false: the end of the action
 * hands control back. The line of arrival goes to the journal (S.9).
 */
export const placePhase: DayPhase = {
  id: 'place',
  run(ctx) {
    const { state } = ctx;
    const active = state.activeAction;
    if (!active || active.target === null || state.interruptRequest || state.day < active.endDay) return false;
    arrive(ctx, active.target);
    return false;
  },
};
