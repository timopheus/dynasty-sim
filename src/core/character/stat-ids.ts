/** The six characteristics (D-031). Kept apart so content schemas can use them without pulling in modifiers. */
export const STAT_IDS = ['diplomacy', 'martial', 'stewardship', 'intrigue', 'learning', 'prowess'] as const;

export type StatId = (typeof STAT_IDS)[number];

export type Stats = Record<StatId, number>;

/** Characteristics an education can raise: all but Prowess (D-032). */
export const EDUCATION_STAT_IDS = ['diplomacy', 'martial', 'stewardship', 'intrigue', 'learning'] as const;
