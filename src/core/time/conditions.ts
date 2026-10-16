import { z } from 'zod';
import { fillReason, joinOr } from '../conditions/reasons';
import { Id } from '../content/types';
import type { Unmet } from '../condition-keys';
import type { Character, Ctx, Scope } from '../state';
import { seasonAt, timeContent } from './seasons';

/** Condition keys of this module (D-054): `season` is a list of season ids, any of which is fine. */
export const timeConditionShape = {
  season: z.array(Id).min(1).optional(),
};

export function checkTimeConditions({ state, content }: Ctx, _c: Character, when: { season?: string[] | undefined }, _scope: Scope): Unmet[] {
  if (!when.season || when.season.includes(seasonAt(content, state.day).id)) return [];
  const { seasons, reasons } = timeContent(content);
  const names = when.season.map((id) => (seasons.find((s) => s.id === id)?.name ?? id).toLowerCase());
  return [{ text: fillReason(reasons.season, { seasons: joinOr(names) }), hidden: false }];
}
