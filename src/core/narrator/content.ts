import { z } from 'zod';
import type { Content, CrossCheck } from '../content/schema';
import { Int } from '../content/types';

/**
 * Top-level content key `narrator` (`content/narrator.yaml`): the pace of events (D-045, D-168).
 * Required (see checkNarrator); the three keys moved here from `settings` (D-160, D-170).
 */
export const NarratorContentSchema = z.strictObject({
  /** Chance per day, out of 10000, that an event fires. */
  eventChancePer10k: Int.min(0).max(10000),
  /** Minimum days between any two events. */
  minDaysBetweenEvents: Int.min(0),
  /** Minimum days before the same event can fire again. */
  eventRepeatCooldownDays: Int.min(0),
});

export type NarratorContent = z.infer<typeof NarratorContentSchema>;

/** The `narrator` content; a cross-check makes sure it exists, so a missing one is a programming error. */
export function narratorContent(content: Content): NarratorContent {
  if (!content.narrator) throw new Error('Content has no narrator section');
  return content.narrator;
}

export const checkNarrator: CrossCheck = ({ narrator }) => {
  if (narrator.length === 0) return [{ file: '(content)', path: 'narrator', message: 'the narrator section (pace of events) is required' }];
  return [];
};
