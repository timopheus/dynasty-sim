import type { Content } from '../content/schema';
import type { Ctx } from '../state';
import { toYmd } from '../time/calendar';

/** An era of the content (D-239): calendar years `from`..`to`; the last era has no end in effect. */
export interface Era {
  id: string;
  name: string;
  from: number;
  to: number | null;
}

/** The era of a day, by content (4.11). Null while the content has no eras. */
export function eraAt(content: Content, day: number): Era | null {
  const list = content.eras?.list;
  if (!list) return null;
  const { year } = toYmd(day);
  let found = list[0];
  for (const era of list) {
    if (year >= era.from) found = era;
  }
  return found ? { id: found.id, name: found.name, from: found.from, to: found.to ?? null } : null;
}

/**
 * The era of a day (4.1 contract, D-310: the era is a function of the year, not a field of the state). The eras have
 * no gaps and the last one goes on after its end (D-385). Null while the content has no eras. Pure, no randomness.
 */
export function eraOf(ctx: Ctx, day: number): Era | null {
  return eraAt(ctx.content, day);
}
