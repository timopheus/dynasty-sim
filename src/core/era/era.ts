import type { Ctx } from '../state';

/** An era of the content (D-239): 4.11 adds the dates and the key `eras`. */
export interface Era {
  id: string;
  name: string;
}

/**
 * The era of a day (4.1 contract, D-310: the era is a function of the year, not a field of the state). Null while
 * the content has no eras; 4.11 fills it, 4.10 (looks) and 4.11 (conditions) call it. Pure, no randomness.
 */
export function eraOf(_ctx: Ctx, _day: number): Era | null {
  return null;
}
