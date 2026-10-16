/**
 * Assembly file (D-052): schema of the YAML content in /content. Every content
 * file is an object with any of the top-level keys below; each module owns its
 * key. Files are merged by the loader: a "single" key must appear exactly once,
 * an "optional" key at most once (null when absent), a "list" key is
 * concatenated in file order. Keys of later tasks are wired with empty schemas.
 */
import { z } from 'zod';
import { ActionSchema, checkActions } from '../actions/content';
import { BackstoryContentSchema, checkBackstory } from '../backstory/content';
import { checkCharacter, NamesSchema, TraitSchema } from '../character/content';
import { checkChronicle, ChronicleContentSchema } from '../chronicle/content';
import { checkEras, ErasContentSchema } from '../era/content';
import { checkEvents, EventSchema } from '../events/content';
import { checkFamily, FamilyContentSchema } from '../family/content';
import { checkHealth, HealthContentSchema } from '../health/content';
import { checkHeirlooms, HeirloomsContentSchema } from '../heirloom/content';
import { checkHouse, HouseContentSchema } from '../house/content';
import { checkNarrator, NarratorContentSchema } from '../narrator/content';
import { checkRelations, OpinionsContentSchema } from '../relations/content';
import { checkStories } from '../stories/content';
import { checkSuccession, SuccessionContentSchema } from '../succession/content';
import { checkGrammar, GrammarSchema } from '../text/grammar';
import { checkTime, TimeContentSchema } from '../time/content';
import { checkWorld, PopulationContentSchema } from '../world/content';
import { checkTemplate } from '../text/text';
import { Int, Range, Text, type ContentError, type Located } from './types';

/** Top-level key `settings`. The pace of events lives in `narrator` (D-170). */
export const SettingsSchema = z.strictObject({
  /** Age in years of the first head of the house. */
  startAge: Range,
  /** Age in years of a placeholder heir (D-007); optional: 4.6 removes it, then the placeholder heir is `adultAge`. */
  heirAge: Range.optional(),
  /** Age of coming of age (D-313, D-314): a child of the household, a head under it needs a guardian. */
  adultAge: Int.min(1),
  startMoney: Int.min(0),
  texts: z.strictObject({
    start: Text,
    death: Text,
    succession: Text,
  }),
});

export const SINGLE_KEYS = ['settings', 'names', 'health'] as const;
export const OPTIONAL_KEYS = [
  'time',
  'population',
  'opinions',
  'chronicle',
  'grammar',
  'narrator',
  'backstory',
  'family',
  'succession',
  'house',
  'heirlooms',
  'eras',
] as const;
export const LIST_KEYS = ['actions', 'events', 'traits'] as const;

export const ContentFileSchema = z.strictObject({
  settings: SettingsSchema.optional(),
  names: NamesSchema.optional(),
  health: HealthContentSchema.optional(),
  time: TimeContentSchema.optional(),
  population: PopulationContentSchema.optional(),
  opinions: OpinionsContentSchema.optional(),
  chronicle: ChronicleContentSchema.optional(),
  grammar: GrammarSchema.optional(),
  narrator: NarratorContentSchema.optional(),
  backstory: BackstoryContentSchema.optional(),
  family: FamilyContentSchema.optional(),
  succession: SuccessionContentSchema.optional(),
  house: HouseContentSchema.optional(),
  heirlooms: HeirloomsContentSchema.optional(),
  eras: ErasContentSchema.optional(),
  actions: z.array(ActionSchema).optional(),
  events: z.array(EventSchema).optional(),
  traits: z.array(TraitSchema).optional(),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type ContentFile = z.infer<typeof ContentFileSchema>;
type SingleKey = (typeof SINGLE_KEYS)[number];
type OptionalKey = (typeof OPTIONAL_KEYS)[number];
type ListKey = (typeof LIST_KEYS)[number];

/** Merged, validated content. Arrays keep file order (files are sorted by path). */
export type Content = { [K in SingleKey | ListKey]: NonNullable<ContentFile[K]> } & {
  [K in OptionalKey]: NonNullable<ContentFile[K]> | null;
};

/** Every item of every key with the file it came from, for cross-checks. */
export type ContentSources = {
  [K in SingleKey | OptionalKey | ListKey]: Located<NonNullable<ContentFile[K]> extends (infer T)[] ? T : NonNullable<ContentFile[K]>>[];
};

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
export const CROSS_CHECKS: readonly CrossCheck[] = [
  checkSettings,
  checkCharacter,
  checkHealth,
  checkTime,
  checkActions,
  checkEvents,
  checkWorld,
  checkRelations,
  checkChronicle,
  checkGrammar,
  checkNarrator,
  checkBackstory,
  checkStories,
  checkFamily,
  checkSuccession,
  checkHouse,
  checkHeirlooms,
  checkEras,
];
