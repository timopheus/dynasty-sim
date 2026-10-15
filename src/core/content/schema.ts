import { z } from 'zod';

/**
 * Schema of the YAML content in /content. Every content file is an object with
 * any of the top-level keys below; files are merged by the loader.
 * Text fields may use the placeholders listed in PLACEHOLDERS.
 */
export const PLACEHOLDERS = ['name', 'age'] as const;

const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are lower_snake_case: a-z, 0-9, _');
const Int = z.int();
const Text = z.string().trim().min(1);

const Range = z
  .strictObject({ min: Int.min(0), max: Int.min(0) })
  .refine((r) => r.max >= r.min, { message: 'max must be >= min' });

const DayRange = z
  .strictObject({ min: Int.min(1), max: Int.min(1) })
  .refine((r) => r.max >= r.min, { message: 'max must be >= min' });

export const EffectsSchema = z.strictObject({
  health: Int.optional(),
  money: Int.optional(),
});

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
  startHealth: Range.refine((r) => r.max <= 100, { message: 'health is 0..100' }),
  startMoney: Int.min(0),
  texts: z.strictObject({
    start: Text,
    death: Text,
    succession: Text,
  }),
});

export const ActionSchema = z.strictObject({
  id: Id,
  name: Text,
  /** Duration in days, rolled when the action starts. */
  duration: DayRange,
  effects: EffectsSchema.optional(),
  /** Chronicle line written when the action completes. */
  text: Text,
});

export const OptionSchema = z.strictObject({
  /** Button label shown to the player. */
  text: Text,
  /** Chronicle line written when this option is chosen. */
  result: Text,
  effects: EffectsSchema.optional(),
});

export const EventSchema = z.strictObject({
  id: Id,
  weight: Int.min(1),
  /** If set, the event can only fire during these actions. */
  actions: z.array(Id).min(1).optional(),
  text: Text,
  options: z.array(OptionSchema).min(1),
});

export const NamesSchema = z.strictObject({
  given: z.array(Text).min(1),
  surnames: z.array(Text).min(1),
});

export const ContentFileSchema = z.strictObject({
  settings: SettingsSchema.optional(),
  actions: z.array(ActionSchema).optional(),
  events: z.array(EventSchema).optional(),
  names: NamesSchema.optional(),
});

export type Effects = z.infer<typeof EffectsSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type ActionDef = z.infer<typeof ActionSchema>;
export type OptionDef = z.infer<typeof OptionSchema>;
export type EventDef = z.infer<typeof EventSchema>;
export type Names = z.infer<typeof NamesSchema>;
export type ContentFile = z.infer<typeof ContentFileSchema>;

/** Merged, validated content. Arrays keep file order (files are sorted by path). */
export interface Content {
  settings: Settings;
  actions: ActionDef[];
  events: EventDef[];
  names: Names;
}
