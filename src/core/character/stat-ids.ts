/** The six characteristics (D-031). Kept apart so content schemas can use them without pulling in modifiers. */
export const STAT_IDS = ['diplomacy', 'martial', 'stewardship', 'intrigue', 'learning', 'prowess'] as const;

export type StatId = (typeof STAT_IDS)[number];

export type Stats = Record<StatId, number>;

/** Characteristics an education can raise: all but Prowess (D-032). */
export const EDUCATION_STAT_IDS = ['diplomacy', 'martial', 'stewardship', 'intrigue', 'learning'] as const;

/** The base of a stat stays within 0 and this, the top step of the scale in `names.statScale` (3.5). */
export const BASE_STAT_MAX = 20;
