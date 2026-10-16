import { z } from 'zod';
import { STAT_IDS } from '../character/stat-ids';
import { conditionRoleRefs, WhenSchema, type When } from '../condition-keys';
import type { ContentSources, CrossCheck } from '../content/schema';
import { Factor, Id, Int, Text, type ContentError } from '../content/types';
import { effectRoleRefs, EffectsSchema, type Effects } from '../effects';
import { heroEffectProblems } from './hero-effects';
import { checkRoles, RolesSchema } from '../roles/content';
import { checkEventTemplate } from '../text/check';
import { GrammarSchema } from '../text/grammar';

/**
 * Schema of an event (storylet), the contract of `docs/event-format.md` (D-161). A superset of the schema of stage
 * 2: the old events (weight, actions, text, options with result and effects) pass unchanged.
 */

/** Fields of an outcome: what happens, the line it writes and where the event goes next. */
const outcomeShape = {
  /** Effects on the main participant. */
  effects: EffectsSchema.optional(),
  /** Effects on roles: role name -> effects on that person. An empty optional role is skipped. */
  on: z.record(Id, EffectsSchema).optional(),
  /** Chronicle line in the third person, starting with `{name}` (D-162); lines of all pages make one entry. */
  result: Text.optional(),
  /** The author wants the line in the chronicle whatever the sum (D-130, D-173 `important`). */
  chronicle: z.boolean().optional(),
  /** A choice that matters: ▸ and always in the chronicle (D-130). Some effects set it by themselves (D-040). */
  mark: z.boolean().optional(),
  /** Page of the same event that follows; without it the event ends here. */
  next: Id.optional(),
  /**
   * Mood of how it ended (D-177, for the hero's portrait, D-300): an id from `narrator.moods`. On a scene it is the
   * mood while the scene is shown; an outcome's mood wins over its scene's. Never changes the course of the game.
   */
  mood: Id.optional(),
};

/** Every option stands only under `offered` (a variant of origin, D-188): the scene shows what its stage offered. */
export function offeredOnlyOptions(options: readonly { when?: When | undefined }[]): boolean {
  return options.length > 0 && options.every((o) => o.when !== undefined && Object.keys(o.when).length === 1 && o.when.offered !== undefined);
}

/** Mood of a scene or outcome that sets none (D-177). `narrator.moods` must list it. */
export const DEFAULT_MOOD = 'neutral';

/** Mood to show: the outcome's, else the scene's, else neutral (D-177). */
export function moodOf(scene: SceneDef, outcome: OutcomeDef | null = null): string {
  return outcome?.mood ?? scene.mood ?? DEFAULT_MOOD;
}

export const OutcomeSchema = z.strictObject(outcomeShape);

/** A check of a stat (D-042): against a difficulty, or against a stat of a role. */
export const CheckSchema = z.strictObject({
  /** Stat of the main participant, or of the role `of`. */
  stat: z.enum(STAT_IDS),
  /** Role whose stat is checked instead of the main participant's (a physician's Learning, D-193); while an optional role is empty, the option is hidden. */
  of: Id.optional(),
  difficulty: Int.optional(),
  against: z.strictObject({ role: Id, stat: z.enum(STAT_IDS) }).optional(),
  /** Bonuses to the stat in this check when the person checked (the main participant, or the role `of`) meets `when`. */
  bonus: z.array(z.strictObject({ when: WhenSchema, add: Int })).min(1).optional(),
});

/** Weights of an option for a person of the world (3.9): stored by the engine, used by 3.9. */
export const AiSchema = z.strictObject({
  base: Int.min(0),
  traits: z.record(Id, Int).optional(),
});

export const OptionSchema = z.strictObject({
  /** Button label shown to the player, second person. */
  text: Text,
  /** Conditions on the main participant: unmet shows the option grey with the reason, or hides it (D-043). */
  when: WhenSchema.optional(),
  check: CheckSchema.optional(),
  /** Outcomes of the check; an option with `check` keeps its outcome fields here. */
  success: OutcomeSchema.optional(),
  failure: OutcomeSchema.optional(),
  ai: AiSchema.optional(),
  ...outcomeShape,
});

/**
 * A scene: the event itself or one of its pages. With `options` the player chooses; without them it is a notice
 * whose outcome fields are on the scene and whose only answer is "Continue".
 */
const sceneShape = {
  text: Text,
  options: z.array(OptionSchema).min(1).optional(),
  ...outcomeShape,
};

export const PageSchema = z.strictObject(sceneShape);

export const SEVERITIES = ['light', 'medium', 'heavy'] as const;

/** Top-level content key `events`, a list merged from all files. */
export const EventSchema = z.strictObject({
  id: Id,
  /** light | medium | heavy, light by default; the narrator (3.7) alternates them. */
  severity: z.enum(SEVERITIES).optional(),
  weight: Int.min(1),
  /** Whose event it is (D-047): the hero, a person of the world near the hero (3.9), or both. Hero by default. */
  who: z.enum(['hero', 'npc', 'both']).optional(),
  /** Deck: the main deck of the narrator, or the scenes of the backstory (3.11). Main by default. */
  deck: z.enum(['main', 'backstory']).optional(),
  /** Stage of the backstory (3.11), for `deck: backstory`. */
  stage: Id.optional(),
  /** Only through `schedule` or `story`, never from the deck (3.8). */
  followup_only: z.boolean().optional(),
  /** Event of a story: possible while the story is open, closes it (3.8). */
  story: Id.optional(),
  /** Once in a life of a head of the house, or once in a game (3.7). */
  once: z.enum(['life', 'game']).optional(),
  /** Days before the event may repeat (3.7). */
  cooldown_days: Int.min(1).optional(),
  tags: z.array(Id).min(1).optional(),
  /** If set, the event can only fire during these actions. */
  actions: z.array(Id).min(1).optional(),
  /** Conditions on the main participant. */
  when: WhenSchema.optional(),
  /** Factors of the weight; with `role`, the factor applies if some candidate of the role meets `when` (D-161). */
  weight_mods: z.array(z.strictObject({ role: Id.optional(), when: WhenSchema, factor: Factor })).min(1).optional(),
  /** Participants besides the hero and the main participant, filled in this order (D-041, `docs/event-format.md`). */
  roles: RolesSchema.optional(),
  /** Own symbols of the grammar (3.4). */
  grammar: GrammarSchema.optional(),
  /** Pages the outcomes lead to with `next`. */
  pages: z.record(Id, PageSchema).optional(),
  ...sceneShape,
});

export type OutcomeDef = z.infer<typeof OutcomeSchema>;
export type CheckDef = z.infer<typeof CheckSchema>;
export type OptionDef = z.infer<typeof OptionSchema>;
export type PageDef = z.infer<typeof PageSchema>;
export type EventDef = z.infer<typeof EventSchema>;
export type SceneDef = EventDef | PageDef;

const OUTCOME_KEYS = Object.keys(outcomeShape) as (keyof OutcomeDef)[];

/** The outcome fields an option, page or event holds itself. */
export function ownOutcome(holder: OutcomeDef): OutcomeDef {
  const out: OutcomeDef = {};
  for (const key of OUTCOME_KEYS) if (holder[key] !== undefined) Object.assign(out, { [key]: holder[key] });
  return out;
}

/** Outcome fields set on the holder; `mood` may also stand on a scene with options, as the scene's own mood. */
function hasOutcomeFields(holder: OutcomeDef, except: readonly (keyof OutcomeDef)[] = []): boolean {
  return OUTCOME_KEYS.some((key) => !except.includes(key) && holder[key] !== undefined);
}

/** The scene of a page; null for the event itself. */
export function sceneOf(event: EventDef, page: string | null): SceneDef {
  if (page === null) return event;
  const scene = event.pages?.[page];
  if (!scene) throw new Error(`Event "${event.id}" has no page "${page}"`);
  return scene;
}

/** Path of a scene in errors and in text slots: `` for the event, `pages.<id>.` for a page. */
export function scenePath(page: string | null): string {
  return page === null ? '' : `pages.${page}.`;
}

interface EventEnv {
  file: string;
  at: string;
  event: EventDef;
  /** Roles a text, condition or effect may name: built-in and declared. */
  known: Set<string>;
  roles: string[];
  /** Roles that may stay empty: texts name them only inside `{role?…}` (3.4). */
  optional: string[];
  /** Grammar symbols the texts may use: the general grammar and the event's own. */
  symbols: string[];
  /** Moods an event may name: `narrator.moods` (D-177). */
  moods: Set<string>;
  errors: ContentError[];
}

function checkMood(env: EventEnv, path: string, mood: string | undefined): void {
  if (mood !== undefined && !env.moods.has(mood)) {
    env.errors.push({ file: env.file, path: `${path}.mood`, message: `unknown mood "${mood}"; moods are listed in narrator.moods` });
  }
}

function pushRefs(env: EventEnv, path: string, refs: string[]): void {
  for (const role of refs) {
    if (!env.known.has(role)) env.errors.push({ file: env.file, path, message: `unknown role "${role}"` });
  }
}

function checkWhen(env: EventEnv, path: string, when: When | undefined): void {
  if (when) pushRefs(env, path, conditionRoleRefs(when));
}

function checkText(env: EventEnv, path: string, text: string | undefined): void {
  if (text === undefined) return;
  const problem = checkEventTemplate(text, { roles: env.roles, optional: env.optional, symbols: env.symbols });
  if (problem) env.errors.push({ file: env.file, path, message: problem });
}

function checkOutcome(env: EventEnv, path: string, outcome: OutcomeDef): void {
  const { file, event, errors } = env;
  if (outcome.effects) pushRefs(env, `${path}.effects`, effectRoleRefs(outcome.effects as Effects));
  for (const [role, effects] of Object.entries(outcome.on ?? {})) {
    if (!env.known.has(role)) errors.push({ file, path: `${path}.on.${role}`, message: `unknown role "${role}"` });
    pushRefs(env, `${path}.on.${role}`, effectRoleRefs(effects as Effects));
  }
  if ((event.who ?? 'hero') === 'npc') {
    // A person of the world chooses, not the player: nothing of what they do changes the hero (D-174).
    const blocks: [string, Effects][] = [...(outcome.effects ? [[`${path}.effects`, outcome.effects as Effects] as [string, Effects]] : []), ...Object.entries(outcome.on ?? {}).map(([role, effects]): [string, Effects] => [`${path}.on.${role}`, effects as Effects])];
    if (outcome.on && Object.hasOwn(outcome.on, 'hero')) {
      errors.push({ file, path: `${path}.on.hero`, message: 'an event of who: npc cannot change the hero (D-174); make it an event of the hero with this person as a role' });
    }
    for (const [at, effects] of blocks) {
      for (const problem of heroEffectProblems(effects)) {
        errors.push({ file, path: at, message: `an event of who: npc cannot change the hero (D-174): ${problem}; make it an event of the hero with this person as a role` });
      }
    }
  }
  checkText(env, `${path}.result`, outcome.result);
  checkMood(env, path, outcome.mood);
  if (outcome.next !== undefined && !event.pages?.[outcome.next]) {
    errors.push({ file, path: `${path}.next`, message: `unknown page "${outcome.next}"` });
  }
  if (outcome.next === undefined && outcome.result === undefined && (event.who ?? 'hero') !== 'npc') {
    errors.push({ file, path, message: 'an outcome that ends a hero event needs a result line' });
  }
}

function checkOption(env: EventEnv, path: string, option: OptionDef): void {
  const { file, errors } = env;
  checkText(env, `${path}.text`, option.text);
  checkWhen(env, `${path}.when`, option.when);
  if (option.check) {
    const { check } = option;
    if ((check.difficulty === undefined) === (check.against === undefined)) {
      errors.push({ file, path: `${path}.check`, message: 'a check has either difficulty or against' });
    }
    if (check.against) {
      const role = check.against.role;
      const def = env.event.roles?.[role];
      if (!env.known.has(role)) errors.push({ file, path: `${path}.check.against.role`, message: `unknown role "${role}"` });
      else if (def?.optional) errors.push({ file, path: `${path}.check.against.role`, message: `role "${role}" is optional and may be empty` });
    }
    if (check.of !== undefined && !env.known.has(check.of)) errors.push({ file, path: `${path}.check.of`, message: `unknown role "${check.of}"` });
    else if (check.of !== undefined && check.of === check.against?.role) errors.push({ file, path: `${path}.check.of`, message: `role "${check.of}" would be checked against itself` });
    check.bonus?.forEach((b, i) => checkWhen(env, `${path}.check.bonus[${i}].when`, b.when));
    if (hasOutcomeFields(option)) errors.push({ file, path, message: 'an option with a check keeps its outcome in success and failure' });
    for (const key of ['success', 'failure'] as const) {
      const outcome = option[key];
      if (outcome) checkOutcome(env, `${path}.${key}`, outcome);
      else errors.push({ file, path: `${path}.${key}`, message: `an option with a check needs ${key}` });
    }
  } else {
    if (option.success || option.failure) errors.push({ file, path, message: 'success and failure need a check' });
    checkOutcome(env, path, ownOutcome(option));
  }
}

function checkScene(env: EventEnv, path: string, scene: SceneDef): void {
  checkText(env, `${path}text`, scene.text);
  const at = path.endsWith('.') ? path.slice(0, -1) : path;
  if (scene.options) {
    if (hasOutcomeFields(scene, ['mood'])) env.errors.push({ file: env.file, path: at, message: 'outcome fields belong to options; only a notice without options has them' });
    checkMood(env, at, scene.mood);
    // The first scene of a backstory event whose options are all offered variants is the exception (D-188): its stage
    // offers some of them every game, and checkBackstory makes sure every variant of the offer has an option here.
    // Pages are not: nothing guarantees what is offered there.
    const offeredOnly = env.event.deck === 'backstory' && scene === env.event && offeredOnlyOptions(scene.options);
    // An option checking an optional role is hidden while the role is empty, so it counts as one with a condition (D-193).
    const conditional = (o: OptionDef): boolean => o.when !== undefined || (o.check?.of !== undefined && !!env.event.roles?.[o.check.of]?.optional);
    if (!offeredOnly && scene.options.every(conditional)) {
      env.errors.push({ file: env.file, path: `${path}options`, message: 'at least one option must have no when, so the player always has a choice' });
    }
    scene.options.forEach((option, i) => checkOption(env, `${path}options[${i}]`, option));
  } else {
    checkOutcome(env, at, ownOutcome(scene));
  }
}

/** Pages reached from the event and the cycles among them. */
function checkPages(env: EventEnv): void {
  const { event, file, at, errors } = env;
  const pages = event.pages ?? {};
  const nextOf = (scene: SceneDef): string[] => {
    const outcomes: OutcomeDef[] = scene.options
      ? scene.options.flatMap((o) => (o.check ? [o.success ?? {}, o.failure ?? {}] : [o]))
      : [scene];
    return outcomes.flatMap((o) => (o.next !== undefined && pages[o.next] ? [o.next] : []));
  };
  const state = new Map<string, 'open' | 'done'>();
  const visit = (id: string, trail: string[]): void => {
    const mark = state.get(id);
    if (mark === 'done') return;
    if (mark === 'open') {
      errors.push({ file, path: `${at}.pages.${id}`, message: `pages loop: ${[...trail, id].join(' -> ')}` });
      return;
    }
    state.set(id, 'open');
    for (const next of nextOf(pages[id] as PageDef)) visit(next, [...trail, id]);
    state.set(id, 'done');
  };
  for (const next of nextOf(event)) visit(next, []);
  for (const id of Object.keys(pages)) {
    if (!state.has(id)) errors.push({ file, path: `${at}.pages.${id}`, message: `page "${id}" is never reached` });
  }
}

/** Traits named in `ai.traits` of the options must exist. */
function checkAiTraits(sources: ContentSources, file: string, at: string, scene: SceneDef, errors: ContentError[]): void {
  const traitIds = new Set(sources.traits.map((t) => t.item.id));
  scene.options?.forEach((option, i) => {
    for (const id of Object.keys(option.ai?.traits ?? {})) {
      if (!traitIds.has(id)) errors.push({ file, path: `${at}.options[${i}].ai.traits.${id}`, message: `unknown trait "${id}"` });
    }
  });
}

function checkEvent(sources: ContentSources, file: string, at: string, event: EventDef, errors: ContentError[]): void {
  checkAiTraits(sources, file, at, event, errors);
  for (const [id, page] of Object.entries(event.pages ?? {})) checkAiTraits(sources, file, `${at}.pages.${id}`, page, errors);
  const roles = Object.keys(event.roles ?? {});
  const optional = roles.filter((r) => event.roles?.[r]?.optional === true);
  const symbols = [...new Set([...sources.grammar.flatMap((g) => Object.keys(g.item)), ...Object.keys(event.grammar ?? {})])];
  const moods = new Set(sources.narrator.flatMap((n) => n.item.moods ?? []));
  const env: EventEnv = { file, at, event, known: new Set(['hero', 'protagonist', ...roles]), roles, optional, symbols, moods, errors };
  if ((event.who ?? 'hero') === 'npc') {
    if (event.actions) errors.push({ file, path: `${at}.actions`, message: 'an event of who: npc is not bound to an action of the hero' });
    if (event.once === 'life') errors.push({ file, path: `${at}.once`, message: 'once: life counts the lives of the heads of the house; an event of who: npc has only once: game' });
  }
  if (event.roles) errors.push(...checkRoles(event.roles, { file, path: `${at}.roles`, sources }));
  // The weight is counted before the roles are filled (D-184): its conditions see only the built-in roles.
  const weightEnv: EventEnv = { ...env, known: new Set(['hero', 'protagonist']) };
  checkWhen(weightEnv, `${at}.when`, event.when);
  event.weight_mods?.forEach((mod, i) => {
    const path = `${at}.weight_mods[${i}]`;
    if (mod.role !== undefined && !roles.includes(mod.role)) errors.push({ file, path: `${path}.role`, message: `unknown role "${mod.role}"; a factor by role names a declared role` });
    checkWhen(weightEnv, `${path}.when`, mod.when);
  });
  checkScene(env, `${at}.`, event);
  for (const [id, page] of Object.entries(event.pages ?? {})) checkScene(env, `${at}.pages.${id}.`, page);
  checkPages(env);
}

export const checkEvents: CrossCheck = (sources) => {
  const { actions, events } = sources;
  const errors: ContentError[] = [];
  const actionIds = new Set(actions.map((a) => a.item.id));
  const ids = new Set<string>();
  for (const { file, index, item } of events) {
    const at = `events[${index}]`;
    if (ids.has(item.id)) errors.push({ file, path: `${at}.id`, message: `duplicate event id "${item.id}"` });
    ids.add(item.id);
    item.actions?.forEach((ref, i) => {
      if (!actionIds.has(ref)) errors.push({ file, path: `${at}.actions[${i}]`, message: `unknown action "${ref}"` });
    });
    checkEvent(sources, file, at, item, errors);
  }
  return errors;
};
