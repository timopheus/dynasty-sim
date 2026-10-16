import { z } from 'zod';
import type { CrossCheck } from '../content/schema';
import { Int } from '../content/types';

/**
 * Top-level content key `chronicle`: thresholds of selection (D-019, D-130), at most once.
 * Without it every line is stored at the level its author gave.
 */
export const ChronicleContentSchema = z.strictObject({
  /** A sum is big if it is at least `min` crowns and at least `percent` of the hero's money before it. */
  bigSum: z.strictObject({
    min: Int.min(1),
    percent: Int.min(1).max(1000),
  }),
  /** The same health line about the same person within this many days is written to the journal. */
  repeatDays: Int.min(0),
  /** People with at least this much fame get their death into the chronicle (◆). */
  famousFame: Int.min(1).max(3),
});

export type ChronicleContent = z.infer<typeof ChronicleContentSchema>;

export const checkChronicle: CrossCheck = () => [];
