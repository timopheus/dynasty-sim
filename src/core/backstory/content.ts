import { z } from 'zod';
import { BASE_STAT_MAX, STAT_IDS, type StatId } from '../character/stat-ids';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';
import { offeredOnlyOptions } from '../events/content';
import { checkTemplate } from '../text/text';

const StageSchema = z.strictObject({
  id: Id,
  /** How many scenes of this stage the founder lives through; 1 by default. */
  scenes: Int.min(1).max(3).optional(),
  /**
   * Age of the founder, in full years, the chronicle lines of this stage are dated at (D-324); without it they are
   * dated at the start of the game. Stages with an age come first, the ages do not fall and stay below
   * settings.startAge.min.
   */
  age: Int.min(0).optional(),
  /**
   * The player is offered `count` of the `variants` by chance (D-167); scenes show a variant only when it was offered
   * (condition `offered`, D-179).
   */
  offer: z.strictObject({ count: Int.min(1), variants: z.array(Id).min(2) }).optional(),
});

/** Top-level content key `backstory`: stages and number of scenes, the neutral base of the founder (D-167, 3.11). */
export const BackstoryContentSchema = z.strictObject({
  /** Base of every stat before the first scene; no traits and no education (D-167). */
  base: z.strictObject(Object.fromEntries(STAT_IDS.map((id) => [id, Int.min(0).max(BASE_STAT_MAX)])) as Record<StatId, z.ZodInt>),
  /** Stages in order; a scene of the deck `backstory` names its stage. */
  stages: z.array(StageSchema).min(1),
  texts: z.strictObject({
    /** The chronicle line after the last scene: the hero goes out into the world. */
    leave: Text,
  }),
});

export type BackstoryContent = z.infer<typeof BackstoryContentSchema>;
export type BackstoryStage = z.infer<typeof StageSchema>;

/** Founder's age may not pass this when the backstory ends (D-038: the game starts at 16-21). */
export const START_AGE_MIN = 16;
export const START_AGE_MAX = 21;

/** Every place under `value` where an object has the key, as a path. */
function findKeys(value: unknown, keys: readonly string[], path: string, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v, i) => findKeys(v, keys, `${path}[${i}]`, out));
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (keys.includes(k)) out.push(`${path}.${k}`);
      findKeys(v, keys, `${path}.${k}`, out);
    }
  }
  return out;
}

/** Highest `age_years` among the values under `value`. */
function maxAge(value: unknown): number {
  if (Array.isArray(value)) return Math.max(0, ...value.map(maxAge));
  if (value === null || typeof value !== 'object') return 0;
  return Math.max(0, ...Object.entries(value).map(([k, v]) => (k === 'age_years' && typeof v === 'number' ? v : maxAge(v))));
}

/** Effects that need days or an action, which scenes of the backstory do not have. */
const NOT_IN_SCENES = ['kill', 'later', 'schedule', 'story', 'end_action'] as const;
const ONLY_IN_SCENES = ['age_years', 'stats_roll'] as const;

export const checkBackstory: CrossCheck = ({ backstory, events, actions, settings }) => {
  const errors: ContentError[] = [];
  const content = backstory[0];
  const scenes = events.filter((e) => e.item.deck === 'backstory');
  if (!content) {
    for (const { file, index } of scenes) errors.push({ file, path: `events[${index}].deck`, message: 'a scene of the backstory needs the key backstory' });
  }
  for (const { file, index, item } of events) {
    if (item.deck !== 'backstory' && item.stage !== undefined) errors.push({ file, path: `events[${index}].stage`, message: 'stage belongs to deck: backstory' });
    if (item.deck === 'backstory') continue;
    // Keys of the scenes only: nothing of the main deck may use them (D-167).
    for (const key of ONLY_IN_SCENES) {
      for (const at of findKeys(item, [key], `events[${index}]`)) errors.push({ file, path: at, message: `${key} is only for scenes of deck: backstory` });
    }
    for (const at of findKeys(item, ['offered'], `events[${index}]`)) errors.push({ file, path: at, message: 'offered is only for scenes of deck: backstory' });
  }
  for (const { file, index, item } of actions) {
    for (const at of findKeys(item, [...ONLY_IN_SCENES, 'offered'], `actions[${index}]`)) errors.push({ file, path: at, message: 'only scenes of deck: backstory may use this key' });
  }
  if (!content) return errors;
  const { file, item: bs } = content;

  const stageIds = new Set<string>();
  const variants = new Set<string>();
  bs.stages.forEach((stage, i) => {
    if (stageIds.has(stage.id)) errors.push({ file, path: `backstory.stages[${i}].id`, message: `duplicate stage "${stage.id}"` });
    stageIds.add(stage.id);
    if (stage.offer) {
      if (stage.offer.count > stage.offer.variants.length) errors.push({ file, path: `backstory.stages[${i}].offer.count`, message: 'count is more than the variants' });
      for (const v of stage.offer.variants) {
        if (variants.has(v)) errors.push({ file, path: `backstory.stages[${i}].offer.variants`, message: `variant "${v}" is listed twice` });
        variants.add(v);
      }
    }
  });
  // Dates of the lines of the stages (D-324): by age, then the start of the game; time never goes back.
  let lastAge = 0;
  let undated: string | null = null;
  bs.stages.forEach((stage, i) => {
    if (stage.age === undefined) {
      undated ??= stage.id;
      return;
    }
    const at = `backstory.stages[${i}].age`;
    if (undated !== null) errors.push({ file, path: at, message: `stage "${undated}" before it has no age: its lines are dated at the start of the game` });
    else if (stage.age < lastAge) errors.push({ file, path: at, message: `age ${stage.age} is below ${lastAge} of a stage before it` });
    const min = settings[0]?.item.startAge.min;
    if (min !== undefined && stage.age >= min) errors.push({ file, path: at, message: `age ${stage.age} is not below settings.startAge.min ${min}` });
    lastAge = Math.max(lastAge, stage.age);
  });
  const leave = checkTemplate(bs.texts.leave);
  if (leave) errors.push({ file, path: 'backstory.texts.leave', message: leave });

  // The age the hero goes out at: start age plus the most the scenes can add (D-038).
  const age = settings[0]?.item.startAge;
  if (age && age.min < START_AGE_MIN) errors.push({ file, path: 'backstory.stages', message: `settings.startAge.min: with a backstory the founder starts at ${START_AGE_MIN} or older` });
  let ageShift = 0;
  for (const stage of bs.stages) {
    const shifts = scenes.filter((s) => s.item.stage === stage.id).map((s) => maxAge([s.item.options, s.item.pages, s.item.effects]));
    shifts.sort((a, b) => b - a);
    ageShift += shifts.slice(0, stage.scenes ?? 1).reduce((a, b) => a + b, 0);
  }
  if (age && age.max + ageShift > START_AGE_MAX) {
    errors.push({ file, path: 'backstory.stages', message: `settings.startAge.max ${age.max} plus up to ${ageShift} years from the scenes goes past ${START_AGE_MAX}` });
  }

  const offeredUsed = new Set<string>();
  for (const { file: eventFile, index, item } of scenes) {
    const at = `events[${index}]`;
    if (item.stage === undefined) errors.push({ file: eventFile, path: `${at}.stage`, message: 'a scene of the backstory needs a stage' });
    else if (!stageIds.has(item.stage)) errors.push({ file: eventFile, path: `${at}.stage`, message: `unknown stage "${item.stage}"` });
    if (item.actions) errors.push({ file: eventFile, path: `${at}.actions`, message: 'a scene of the backstory has no action' });
    if (item.followup_only || item.story !== undefined) errors.push({ file: eventFile, path: at, message: 'a scene of the backstory is picked by its stage, not by follow-ups or stories' });
    if (item.who !== undefined && item.who !== 'hero') errors.push({ file: eventFile, path: `${at}.who`, message: 'a scene of the backstory is the hero\'s' });
    // Scenes have no action and no days: nothing may wait for either, and nobody dies (D-173).
    const body = { options: item.options, pages: item.pages, effects: item.effects, on: item.on };
    for (const key of NOT_IN_SCENES) {
      for (const where of findKeys(body, [key], at)) errors.push({ file: eventFile, path: where, message: `${key} is not allowed in a scene of the backstory (no action and no days pass)` });
    }
    for (const where of findKeys(findOn(item), ONLY_IN_SCENES, `${at}.on`)) errors.push({ file: eventFile, path: where, message: 'changes the main participant only: not in on' });
    // A scene whose options are all offered variants (D-188): every variant its stage offers must have an option here,
    // so whatever is drawn, the player sees `count` options.
    const options = item.options ?? [];
    if (offeredOnlyOptions(options)) {
      const offer = bs.stages.find((s) => s.id === item.stage)?.offer;
      if (!offer) errors.push({ file: eventFile, path: `${at}.options`, message: 'every option is an offered variant, but the stage offers none' });
      else {
        const shown = new Set(options.map((o) => o.when?.offered));
        for (const v of offer.variants) {
          if (!shown.has(v)) errors.push({ file: eventFile, path: `${at}.options`, message: `every option is an offered variant, but variant "${v}" of stage "${item.stage}" has no option here` });
        }
      }
    }
    collectOffered(body).forEach((id) => {
      offeredUsed.add(id);
      if (!variants.has(id)) errors.push({ file: eventFile, path: at, message: `offered "${id}" is not a variant of any stage` });
    });
  }
  for (const v of variants) {
    if (!offeredUsed.has(v)) errors.push({ file, path: 'backstory.stages', message: `variant "${v}" is never shown by a scene` });
  }
  return errors;
};

/** `on` blocks of a scene, outcomes of options and pages included. */
function findOn(item: { options?: unknown; pages?: unknown; on?: unknown }): unknown[] {
  const out: unknown[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (k === 'on') out.push(v);
        else visit(v);
      }
    }
  };
  visit({ options: item.options, pages: item.pages });
  if (item.on) out.push(item.on);
  return out;
}

/** Ids named by `offered` conditions under the value. */
function collectOffered(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => collectOffered(v, out));
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'offered' && typeof v === 'string') out.push(v);
      else collectOffered(v, out);
    }
  }
  return out;
}
