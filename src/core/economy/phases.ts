import type { DayPhase } from '../state';

/**
 * The day phase of the economy (D-326): empty until S.7 brings the monthly balance on the first of the month. It
 * returns false: the economy never stops time by itself.
 */
export const economyPhase: DayPhase = {
  id: 'economy',
  run: () => false,
};
