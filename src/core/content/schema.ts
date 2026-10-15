/**
 * Assembly file (D-052): schema of the YAML content in /content. Every content
 * file is an object with any of the top-level keys below; each module owns its
 * key. Files are merged by the loader: a "single" key must appear exactly once,
 * a "list" key is concatenated in file order.
 */
import { z } from 'zod';
import { ActionSchema, checkActions } from '../actions/content';
import { NamesSchema } from '../character/content';
import { checkEvents, EventSchema } from '../events/content';
import { HealthContentSchema } from '../health/content';
import { checkTemplate } from '../text/text';
import { Int, Range, Text, type ContentError, type Located } from './types';

export const SettingsSchema = z.strictObject({
  /** Chance per day, out of 10000, that an event fires. */
  eventChancePer10k: Int.min(0).max(10000),
  /** Minimum days between any two events (storyteller pacing). */
  minDaysBetweenEvents: Int.min(0),
  /** Minimum days before the same event can fire again. */
  eventRepeatCooldownDays: Int.min(0),
  /** Age in years of the first head of the house. */
  startAge: Range,
  /** Age in years of a placeholder heir (stub until the Dynasty stage). */
  heirAge: Range,
  startMoney: Int.min(0),
  texts: z.strictObject({
    start: Text,
    death: Text,
    succession: Text,
  }),
});

export const SINGLE_KEYS = ['settings', 'names', 'health'] as const;
export const LIST_KEYS = ['actions', 'events'] as const;

export const ContentFileSchema = z.strictObject({
  settings: SettingsSchema.optional(),
  names: NamesSchema.optional(),
  health: HealthContentSchema.optional(),
  actions: z.array(ActionSchema).optional(),
  events: z.array(EventSchema).optional(),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type ContentFile = z.infer<typeof ContentFileSchema>;
type SingleKey = (typeof SINGLE_KEYS)[number];
type ListKey = (typeof LIST_KEYS)[number];

/** Merged, validated content. Arrays keep file order (files are sorted by path). */
export type Content = { [K in SingleKey]: NonNullable<ContentFile[K]> } & { [K in ListKey]: NonNullable<ContentFile[K]> };

/** Every item of every key with the file it came from, for cross-checks. */
export type ContentSources = { [K in SingleKey | ListKey]: Located<Content[K] extends (infer T)[] ? T : Content[K]>[] };

/** A check across items or modules; sees the items of every file that passed the schema. */
export type CrossCheck = (sources: ContentSources) => ContentError[];

const checkSettings: CrossCheck = ({ settings }) => {
  const errors: ContentError[] = [];
  for (const { file, item } of settings) {
    for (const [key, text] of Object.entries(item.texts)) {
      const problem = checkTemplate(text);
      if (problem) errors.push({ file, path: `settings.texts.${key}`, message: problem });
    }
  }
  return errors;
};

/** Cross-checks of all modules, in a fixed order. */
export const CROSS_CHECKS: readonly CrossCheck[] = [checkSettings, checkActions, checkEvents];
