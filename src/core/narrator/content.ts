import { z } from 'zod';
import { conditionRoleRefs, WhenSchema } from '../condition-keys';
import type { Content, CrossCheck } from '../content/schema';
import { Factor, Int, type ContentError } from '../content/types';

/** From this nominal duration (days) an action counts as long (D-168); the default of `longActionDays`. */
export const DEFAULT_LONG_ACTION_DAYS = 60;

/**
 * Tension (D-231): medium and heavy events raise it, it fades by itself. At `high` and above heavy events do not
 * fall and light ones weigh more by `lightFactor`.
 */
export const TensionSchema = z.strictObject({
  gain: z.strictObject({ medium: Int.min(0), heavy: Int.min(0) }),
  decayPerDay: Int.min(0),
  high: Int.min(1),
  lightFactor: Factor,
});

/**
 * The way up from the bottom (D-017, D-165, D-233): while `when` holds for the hero, events tagged `way_up` weigh
 * `wayUpFactor` times more; after `forceAfterDays` at the bottom without one, the next roll picks a `way_up` event
 * outside the usual chance.
 */
export const BottomSchema = z.strictObject({
  when: WhenSchema,
  wayUpFactor: Factor,
  forceAfterDays: Int.min(1),
});

/**
 * Top-level content key `narrator` (`content/narrator.yaml`): the pace of events (D-045, D-168, D-230).
 * Required (see checkNarrator).
 */
export const NarratorContentSchema = z.strictObject({
  /** Chance per day, out of 10000, that an event fires; for actions shorter than `longActionDays`. */
  eventChancePer10k: Int.min(0).max(10000),
  /** Nominal duration (mean of the action's range, days) from which an action is long; 60 by default (D-168). */
  longActionDays: Int.min(1).optional(),
  /** The same chance on long actions; `eventChancePer10k` if absent. */
  longActionChancePer10k: Int.min(0).max(10000).optional(),
  /**
   * Chance per day, out of 10000, that one event of a person of the circle fires (D-047, D-166, 3.9): a single
   * roll for the whole circle. 0 if absent.
   */
  npcChancePer10k: Int.min(0).max(10000).optional(),
  /** Minimum days between any two events. */
  minDaysBetweenEvents: Int.min(0),
  /** Minimum days before the same event can fire again; `cooldown_days` of the event replaces it. */
  eventRepeatCooldownDays: Int.min(0),
  tension: TensionSchema.optional(),
  bottom: BottomSchema.optional(),
});

export type NarratorContent = z.infer<typeof NarratorContentSchema>;

/** The `narrator` content; a cross-check makes sure it exists, so a missing one is a programming error. */
export function narratorContent(content: Content): NarratorContent {
  if (!content.narrator) throw new Error('Content has no narrator section');
  return content.narrator;
}

export const checkNarrator: CrossCheck = ({ narrator }) => {
  if (narrator.length === 0) return [{ file: '(content)', path: 'narrator', message: 'the narrator section (pace of events) is required' }];
  const errors: ContentError[] = [];
  for (const { file, item } of narrator) {
    const when = item.bottom?.when;
    // The bottom is a state of the hero; there is no other participant yet.
    for (const role of when ? conditionRoleRefs(when) : []) {
      if (role !== 'hero' && role !== 'protagonist') {
        errors.push({ file, path: 'narrator.bottom.when', message: `the bottom can only refer to the hero, not to the role "${role}"` });
      }
    }
  }
  return errors;
};
