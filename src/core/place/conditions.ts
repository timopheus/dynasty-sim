import { z } from 'zod';
import type { Unmet } from '../condition-keys';
import { fillReason, joinOr } from '../conditions/reasons';
import { Id } from '../content/types';
import type { Character, Ctx, Scope } from '../state';
import { heroPlaceKind, placeKeyOf, ROAD_KIND, standingIn } from './place';

/**
 * Condition keys of this module (D-437, S.9a); they name nobody else:
 * - `at_place_kind: [town, village]` — the hero is in a place of one of these kinds; `road` means on the road;
 * - `at_place: [ostmere]` — the hero stands in one of these places (ids of `places.list`); on the road and on a journey
 *   (even passing through it) he is in none.
 * Unmet, the reason is visible (`places.reasons.kind` / `place`): the hero knows where he is. Only the hero has a place
 * (D-461): for anyone else the condition is unmet and hidden, as it is without places in the content.
 */
export const placeConditionShape = {
  at_place_kind: z.array(Id).min(1).optional(),
  at_place: z.array(Id).min(1).optional(),
};

interface PlaceWhen {
  at_place_kind?: string[] | undefined;
  at_place?: string[] | undefined;
}

export function checkPlaceConditions(ctx: Ctx, c: Character, when: PlaceWhen, _scope: Scope): Unmet[] {
  if (when.at_place_kind === undefined && when.at_place === undefined) return [];
  const { state, content } = ctx;
  const places = content.places;
  if (!places || c.id !== state.playerId) return [{ text: '', hidden: true }];
  const out: Unmet[] = [];
  if (when.at_place_kind) {
    const kind = heroPlaceKind(state, content);
    if (kind === null || !when.at_place_kind.includes(kind)) {
      const names = when.at_place_kind.map((id) => (id === ROAD_KIND ? places.road : (places.kinds.find((k) => k.id === id)?.name ?? id)));
      out.push({ text: fillReason(places.reasons.kind, { kinds: joinOr(names) }), hidden: false });
    }
  }
  if (when.at_place) {
    const at = standingIn(state, content);
    const key = at === null ? null : placeKeyOf(state, at);
    if (key === null || !when.at_place.includes(key)) {
      const names = when.at_place.map((id) => places.list.find((p) => p.id === id)?.name ?? id);
      out.push({ text: fillReason(places.reasons.place, { places: joinOr(names) }), hidden: false });
    }
  }
  return out;
}
