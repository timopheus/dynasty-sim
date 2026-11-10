import { z } from 'zod';
import { BASE_STAT_MAX, STAT_IDS, type StatId } from '../character/stat-ids';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';
import { offeredOnlyOptions } from '../events/content';
import { checkReason } from '../conditions/reasons';
import { PLACEHOLDERS } from '../character/text';
import { checkTemplate } from '../text/text';

const StageSchema = z.strictObject({
  id: Id,
  /** How many scenes of this stage the founder lives through; 1 by default. */
  scenes: Int.min(1).max(3).optional(),
  /**
   * Age of the founder, in full years, of the stage. On the clock (`fromBirth`, D-479) the first scene of the stage
   * falls on a day of that year of his life, by chance (D-445); a stage without it comes right after the one before.
   * The old way the chronicle lines of the stage are dated at it (D-324), and without it at the start of the game;
   * stages with an age come first and stay below settings.startAge.min. The ages never fall.
   */
  age: Int.min(0).optional(),
  /**
   * The player is offered `count` of the `variants` by chance (D-167); scenes show a variant only when it was offered
   * (condition `offered`, D-179).
   */
  offer: z.strictObject({ count: Int.min(1), variants: z.array(Id).min(2) }).optional(),
});

/**
 * Fates of the founder's parents (D-481, T.3): at the birth each parent alive gets a fate on a day of the founder's
 * childhood, between the ages `ages.min` and `ages.max` (full years, below START_AGE_MIN, so before he goes out). With
 * `missingPct` percent it is a disappearance (the cause `vanished`), else a death with one of `causes` by chance (ids
 * of `health.causes`). The line in the chronicle is about the founder: `{name}` and his pronouns, `{parent}` the parent.
 */
const FatesSchema = z.strictObject({
  ages: z.strictObject({ min: Int.min(0), max: Int.min(0) }),
  missingPct: Int.min(0).max(100),
  causes: z.array(Id).min(1),
  texts: z.strictObject({ father_died: Text, mother_died: Text, father_vanished: Text, mother_vanished: Text }),
});

/** The cause of death of a parent who went missing (D-481): for the rules a death. */
export const VANISHED = 'vanished';

/** Placeholders of the lines of the fates: those of the founder and the parent. */
const FATE_PLACEHOLDERS = [...PLACEHOLDERS, 'parent'];

/** Top-level content key `backstory`: stages and number of scenes, the neutral base of the founder (D-167, 3.11). */
export const BackstoryContentSchema = z.strictObject({
  /**
   * One clock (D-479): the game begins at the founder's birth on day 0 and the world lives between the scenes. Without
   * it the founder is made at `settings.startAge` and the scenes are told at the start (the old way, until T.4).
   */
  fromBirth: z.boolean().optional(),
  /** Base of every stat before the first scene; no traits and no education (D-167). */
  base: z.strictObject(Object.fromEntries(STAT_IDS.map((id) => [id, Int.min(0).max(BASE_STAT_MAX)])) as Record<StatId, z.ZodInt>),
  /** Stages in order; a scene of the deck `backstory` names its stage. */
  stages: z.array(StageSchema).min(1),
  /** Fates of the parents on the clock (D-481); `fromBirth` needs them. */
  fates: FatesSchema.optional(),
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

/** Highest `years` among the values under `value`. */
function maxYears(value: unknown): number {
  if (Array.isArray(value)) return Math.max(0, ...value.map(maxYears));
  if (value === null || typeof value !== 'object') return 0;
  return Math.max(0, ...Object.entries(value).map(([k, v]) => (k === 'years' && typeof v === 'number' ? v : maxYears(v))));
}

/** The hidden action the founder waits in between the scenes on the clock (D-479); see backstory/phases.ts. */
const EARLY_YEARS = 'early_years';

/** Effects that need days or an action, which scenes of the backstory do not have. */
const NOT_IN_SCENES = ['kill', 'later', 'schedule', 'story', 'end_action'] as const;
const ONLY_IN_SCENES = ['years', 'stats_roll'] as const;

export const checkBackstory: CrossCheck = ({ backstory, events, actions, settings, health }) => {
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
    // `backstory_only` hides the action the backstory sets itself (D-479); nothing else may be hidden this way
    const only = item.when?.backstory_only === true;
    if (only !== (item.id === EARLY_YEARS)) errors.push({ file, path: `actions[${index}].when`, message: `when: { backstory_only: true } is for the action ${EARLY_YEARS} alone, and it needs it` });
    if (item.id === EARLY_YEARS && (item.idle !== true || item.effects !== undefined || item.until !== undefined || item.target !== undefined)) {
      errors.push({ file, path: `actions[${index}]`, message: `${EARLY_YEARS} is idle and has no effects, goal or target: the founder only waits for the next scene` });
    }
  }
  for (const { file, index, item } of events) {
    if (item.actions?.includes(EARLY_YEARS)) errors.push({ file, path: `events[${index}].actions`, message: `${EARLY_YEARS} has no events: the child founder gets only the scenes (D-479)` });
  }
  for (const { file, index, item } of events) {
    for (const at of findKeys({ when: item.when, roles: item.roles, options: item.options, pages: item.pages }, ['backstory_only'], `events[${index}]`)) errors.push({ file, path: at, message: 'backstory_only is for an action' });
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
  const leave = checkTemplate(bs.texts.leave);
  if (leave) errors.push({ file, path: 'backstory.texts.leave', message: leave });
  /** The most years of study the scenes of a stage can add: its `scenes` scenes with the most. */
  const stageYears = (stage: BackstoryStage): number => {
    const most = scenes.filter((s) => s.item.stage === stage.id).map((s) => maxYears([s.item.options, s.item.pages, s.item.effects]));
    most.sort((a, b) => b - a);
    return most.slice(0, stage.scenes ?? 1).reduce((a, b) => a + b, 0);
  };
  if (bs.fromBirth) errors.push(...checkClock(file, bs, actions.some((a) => a.item.id === EARLY_YEARS), stageYears));
  if (bs.fromBirth && !bs.fates) errors.push({ file, path: 'backstory.fates', message: 'the clock needs the fates of the parents (D-481)' });
  if (bs.fates) errors.push(...checkFates(file, bs.fates, new Set((health[0]?.item.causes ?? []).map((c) => c.id))));
  else errors.push(...checkAtOnce(file, bs, settings[0]?.item.startAge, stageYears));

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

/**
 * One clock (D-479): the ages of the stages never fall, and the years of study before a stage never carry the founder
 * past its age; he goes out into the world at START_AGE_MAX at the latest. The action to wait in must be there.
 */
function checkClock(file: string, bs: BackstoryContent, hasWait: boolean, stageYears: (s: BackstoryStage) => number): ContentError[] {
  const errors: ContentError[] = [];
  if (!hasWait) errors.push({ file, path: 'backstory.fromBirth', message: `the clock needs the action ${EARLY_YEARS} to wait for the scenes in` });
  // the oldest the founder can be when the stage begins, in full years
  let reach = 0;
  let lastAge = 0;
  bs.stages.forEach((stage, i) => {
    if (stage.age !== undefined) {
      const at = `backstory.stages[${i}].age`;
      if (stage.age < lastAge) errors.push({ file, path: at, message: `age ${stage.age} is below ${lastAge} of a stage before it` });
      else if (reach > stage.age) errors.push({ file, path: at, message: `the years of study before stage "${stage.id}" can bring the founder to ${reach}, past its age ${stage.age}` });
      lastAge = Math.max(lastAge, stage.age);
      reach = Math.max(reach, stage.age);
    }
    reach += stageYears(stage);
  });
  if (reach > START_AGE_MAX) errors.push({ file, path: 'backstory.stages', message: `the founder can go out into the world at ${reach}, past ${START_AGE_MAX} (D-038)` });
  return errors;
}

/** Ages within the childhood, causes known, `vanished` among the causes of death, lines well formed (D-481). */
function checkFates(file: string, fates: z.infer<typeof FatesSchema>, causes: ReadonlySet<string>): ContentError[] {
  const errors: ContentError[] = [];
  if (fates.ages.min > fates.ages.max) errors.push({ file, path: 'backstory.fates.ages', message: 'min is above max' });
  if (fates.ages.max >= START_AGE_MIN) errors.push({ file, path: 'backstory.fates.ages.max', message: `a fate comes before the founder goes out: below ${START_AGE_MIN}` });
  fates.causes.forEach((c, i) => {
    if (!causes.has(c)) errors.push({ file, path: `backstory.fates.causes[${i}]`, message: `unknown cause "${c}": not in health.causes` });
  });
  if (fates.missingPct > 0 && !causes.has(VANISHED)) errors.push({ file, path: 'backstory.fates.missingPct', message: `a disappearance needs the cause "${VANISHED}" in health.causes` });
  for (const [key, text] of Object.entries(fates.texts)) {
    const problem = checkReason(text, FATE_PLACEHOLDERS);
    if (problem) errors.push({ file, path: `backstory.fates.texts.${key}`, message: problem });
  }
  return errors;
}

/** The old way (until T.4): the lines are dated by the ages of the stages (D-324); the scenes make the founder older. */
function checkAtOnce(file: string, bs: BackstoryContent, age: { min: number; max: number } | undefined, stageYears: (s: BackstoryStage) => number): ContentError[] {
  const errors: ContentError[] = [];
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
    if (age !== undefined && stage.age >= age.min) errors.push({ file, path: at, message: `age ${stage.age} is not below settings.startAge.min ${age.min}` });
    lastAge = Math.max(lastAge, stage.age);
  });
  // The age the hero goes out at: start age plus the most the scenes can add (D-038).
  if (age && age.min < START_AGE_MIN) errors.push({ file, path: 'backstory.stages', message: `settings.startAge.min: with a backstory the founder starts at ${START_AGE_MIN} or older` });
  const ageShift = bs.stages.reduce((sum, stage) => sum + stageYears(stage), 0);
  if (age && age.max + ageShift > START_AGE_MAX) {
    errors.push({ file, path: 'backstory.stages', message: `settings.startAge.max ${age.max} plus up to ${ageShift} years from the scenes goes past ${START_AGE_MAX}` });
  }
  return errors;
}

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
