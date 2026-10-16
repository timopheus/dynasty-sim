import { z } from 'zod';
import { STAT_IDS } from '../character/stat-ids';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';
import { checkReason } from '../conditions/reasons';
import { walkKeys } from '../conditions/walk';
import type { EventDef, OutcomeDef as EventOutcome } from '../events/content';
import { checkTemplate } from '../text/text';

/** Weekly chances are out of 10000 (D-003: integers only). */
const Per10k = Int.min(0).max(10000);

/** Where a weekly transition leads: another stage of the same condition, recovery or death. */
export const HEAL = 'heal';
export const DEATH = 'death';

const Penalties = z.strictObject(Object.fromEntries(STAT_IDS.map((id) => [id, Int.max(0).optional()])) as Record<(typeof STAT_IDS)[number], z.ZodOptional<z.ZodInt>>);

const TransitionSchema = z.strictObject({
  /** A stage id of the same condition, `heal` or `death`. */
  to: Id,
  per10k: Per10k,
});

const StageSchema = z.strictObject({
  id: Id,
  name: Text,
  /** Days in the stage before its transitions are rolled. */
  minDays: Int.min(0).default(0),
  /** A severe stage interrupts the hero's action and fails the `fit` condition. */
  severe: z.boolean().default(false),
  /** Stat changes while in the stage, zero or less. */
  penalties: Penalties.optional(),
  /** Multiplier of the daily death chance from the mortality table. */
  mortality: Int.min(1).default(1),
  /** Line written when a character enters the stage by a transition: chronicle if severe, else journal. */
  text: Text.optional(),
  /** Rolled once a week in this order; whatever is left of 10000 means no change. */
  transitions: z.array(TransitionSchema).default([]),
});

const OutcomeSchema = z.strictObject({
  weight: Int.min(1),
  /** An injury trait (category body) the healed character gains. */
  trait: Id.optional(),
  /** Traits the injury takes away, such as a skill that needs both hands. */
  removes: z.array(Id).min(1).optional(),
  /** A condition that follows, such as an old wound. */
  condition: Id.optional(),
  /** Chronicle line when the outcome leaves a trait or a condition, journal line otherwise. */
  text: Text.optional(),
});

const ConditionSchema = z.strictObject({
  id: Id,
  name: Text,
  /** `wound` comes from the `wound` effect, `disease` from `disease`; `frailty` only by onset. */
  kind: z.enum(['wound', 'disease', 'frailty']),
  /** Death cause id when the condition kills (a stage leads to death or has the highest mortality). */
  cause: Id,
  /** Never goes away: `heal` at the first stage does nothing and no stage leads to `heal`. */
  permanent: z.boolean().default(false),
  stages: z.array(StageSchema).min(1),
  /** Rolled when the condition heals; required unless permanent. */
  outcomes: z.array(OutcomeSchema).default([]),
});

const OnsetSchema = z.strictObject({
  condition: Id,
  /** Weekly chance out of 10000. */
  per10k: Per10k,
  /** Full years from which the onset is rolled. */
  ageMin: Int.min(0).default(0),
  /** Line written when the condition starts this way. */
  text: Text.optional(),
});

const MortalityRowSchema = z.strictObject({
  /** The row applies below this age in full years; the last row has no limit. */
  below: Int.min(1).optional(),
  /** Annual deaths per 100,000 before the multipliers of conditions. */
  per100k: Int.min(0).max(100000),
  /** Cause of a death from this row when no condition is to blame. */
  cause: Id,
});

/** Percent applied to the chances of transitions toward recovery (`better`) and toward death (`worse`). */
const ChanceShiftSchema = z.strictObject({
  actions: z.array(Id),
  better: Int.min(0),
  worse: Int.min(0),
});

/** Top-level content key `health`, defined exactly once (D-033). */
export const HealthContentSchema = z.strictObject({
  conditions: z.array(ConditionSchema),
  onsets: z.array(OnsetSchema).default([]),
  mortality: z.array(MortalityRowSchema).min(1),
  /** Chronicle line after the death line, by cause id. */
  causes: z.array(z.strictObject({ id: Id, text: Text })).min(1),
  /** Actions of rest: transitions toward recovery are likelier. */
  rest: ChanceShiftSchema,
  /** Actions on the road: transitions toward death are likelier. */
  road: ChanceShiftSchema,
  texts: z.strictObject({
    /** Journal line when a severe stage breaks off the hero's action. */
    interrupted: Text,
    /** Reason shown for an action that needs `fit: true`; shown as is. */
    unfit: Text,
    /** Reasons for `conditions_any` and `conditions_none` (3.5); placeholder `{conditions}`, a list of condition names. */
    conditions_any: Text,
    conditions_none: Text,
  }),
});

export type HealthContent = z.infer<typeof HealthContentSchema>;
export type ConditionDef = z.infer<typeof ConditionSchema>;
export type StageDef = z.infer<typeof StageSchema>;
export type OutcomeDef = z.infer<typeof OutcomeSchema>;

interface EffectRefs {
  wound?: unknown;
  disease?: unknown;
  heal?: unknown;
}

/** Calls `visit` for every `effects` block anywhere inside `node`, nested `later` included. */
function walkEffects(node: unknown, path: string, visit: (effects: EffectRefs, path: string) => void): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkEffects(item, `${path}[${i}]`, visit));
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      const at = `${path}.${key}`;
      if (key === 'effects' && value !== null && typeof value === 'object') visit(value as EffectRefs, at);
      walkEffects(value, at, visit);
    }
  }
}

interface KillRefs {
  kill?: unknown;
  later?: { effects?: KillRefs }[];
}

/** Paths and causes of every `kill` in `effects`, the nested `later` included. */
function killsIn(effects: KillRefs, path: string): { path: string; cause: unknown }[] {
  const out: { path: string; cause: unknown }[] = effects.kill === undefined ? [] : [{ path: `${path}.kill`, cause: effects.kill }];
  (effects.later ?? []).forEach((entry, i) => {
    if (entry.effects) out.push(...killsIn(entry.effects, `${path}.later[${i}].effects`));
  });
  return out;
}

/**
 * `kill` of a hero is only for the failure of a heavy event, and only where the outcome ends the event (D-164). The
 * hero may be the target of `effects` (unless the event is `who: npc`, where the main participant is a person of the
 * world), of `on: {hero: …}` and of `on: {protagonist: …}` (the same person as the main participant); the other roles
 * come from the circle and are never the hero.
 */
function checkKills(event: EventDef, at: string, causeIds: Set<string>, file: string, errors: ContentError[]): void {
  const main = event.who ?? 'hero';
  const checkOutcome = (outcome: EventOutcome, path: string, mayKillHero: boolean) => {
    const targets: [string, KillRefs | undefined, boolean][] = [
      ['effects', outcome.effects as KillRefs | undefined, main !== 'npc'],
      ...Object.entries(outcome.on ?? {}).map(([role, effects]): [string, KillRefs, boolean] => [
        `on.${role}`,
        effects as KillRefs,
        role === 'hero' || (role === 'protagonist' && main !== 'npc'),
      ]),
    ];
    for (const [key, effects, hero] of targets) {
      if (!effects) continue;
      for (const kill of killsIn(effects, `${path}.${key}`)) {
        if (typeof kill.cause === 'string' && !causeIds.has(kill.cause)) {
          errors.push({ file, path: kill.path, message: `unknown cause "${kill.cause}"` });
        }
        if (!hero) continue;
        if (event.deck === 'backstory') continue; // 3.11 forbids kill in the scenes of the backstory
        if (!mayKillHero) {
          errors.push({ file, path: kill.path, message: 'kill of a hero is allowed only in the failure of a check in a heavy event' });
        } else if (outcome.next !== undefined) {
          errors.push({ file, path: kill.path, message: 'kill of a hero is allowed only in an outcome without next' });
        }
      }
    }
  };
  const checkScene = (scene: EventDef | NonNullable<EventDef['pages']>[string], path: string) => {
    const heavy = event.severity === 'heavy';
    if (!scene.options) {
      checkOutcome(scene, path, false);
      return;
    }
    scene.options.forEach((option, i) => {
      const optionPath = `${path}options[${i}]`;
      if (option.check) {
        if (option.success) checkOutcome(option.success, `${optionPath}.success`, false);
        if (option.failure) checkOutcome(option.failure, `${optionPath}.failure`, heavy);
      } else {
        checkOutcome(option, optionPath, false);
      }
    });
  };
  checkScene(event, `${at}.`);
  for (const [id, page] of Object.entries(event.pages ?? {})) checkScene(page, `${at}.pages.${id}.`);
}

export const checkHealth: CrossCheck = ({ health, traits, actions, events, grammar }) => {
  const errors: ContentError[] = [];
  const traitById = new Map(traits.map(({ item }) => [item.id, item]));
  const actionIds = new Set(actions.map(({ item }) => item.id));
  const conditionKinds = new Map<string, string>();

  for (const { file, item } of health) {
    const causeIds = new Set<string>();
    item.causes.forEach((cause, i) => {
      if (causeIds.has(cause.id)) errors.push({ file, path: `health.causes[${i}].id`, message: `duplicate cause id "${cause.id}"` });
      causeIds.add(cause.id);
      const problem = checkTemplate(cause.text);
      if (problem) errors.push({ file, path: `health.causes[${i}].text`, message: problem });
    });
    for (const c of item.conditions) conditionKinds.set(c.id, c.kind);

    const seen = new Set<string>();
    item.conditions.forEach((cond, i) => {
      const at = `health.conditions[${i}]`;
      if (seen.has(cond.id)) errors.push({ file, path: `${at}.id`, message: `duplicate condition id "${cond.id}"` });
      seen.add(cond.id);
      if (cond.id === 'all') errors.push({ file, path: `${at}.id`, message: '"all" is reserved for heal: all' });
      if (!causeIds.has(cond.cause)) errors.push({ file, path: `${at}.cause`, message: `unknown cause "${cond.cause}"` });
      const stageIds = new Set(cond.stages.map((s) => s.id));
      if (stageIds.size !== cond.stages.length) errors.push({ file, path: `${at}.stages`, message: 'stage ids must be unique' });
      for (const reserved of [HEAL, DEATH]) {
        if (stageIds.has(reserved)) errors.push({ file, path: `${at}.stages`, message: `"${reserved}" is reserved and cannot be a stage id` });
      }
      cond.stages.forEach((stage, j) => {
        const sat = `${at}.stages[${j}]`;
        let total = 0;
        stage.transitions.forEach((t, k) => {
          total += t.per10k;
          if (t.to === HEAL && cond.permanent) {
            errors.push({ file, path: `${sat}.transitions[${k}].to`, message: 'a permanent condition never heals' });
          } else if (t.to !== HEAL && t.to !== DEATH && !stageIds.has(t.to)) {
            errors.push({ file, path: `${sat}.transitions[${k}].to`, message: `unknown stage "${t.to}"` });
          } else if (t.to === stage.id) {
            errors.push({ file, path: `${sat}.transitions[${k}].to`, message: 'a transition must lead to another stage' });
          }
        });
        if (total > 10000) errors.push({ file, path: `${sat}.transitions`, message: `weekly chances add up to ${total}, more than 10000` });
        if (stage.text) {
          const problem = checkTemplate(stage.text);
          if (problem) errors.push({ file, path: `${sat}.text`, message: problem });
        }
      });
      if (!cond.permanent && cond.outcomes.length === 0) {
        errors.push({ file, path: `${at}.outcomes`, message: 'a condition that heals needs at least one outcome' });
      }
      if (cond.permanent && cond.outcomes.length > 0) {
        errors.push({ file, path: `${at}.outcomes`, message: 'a permanent condition never heals, so it has no outcomes' });
      }
      cond.outcomes.forEach((o, j) => {
        const oat = `${at}.outcomes[${j}]`;
        if (o.trait !== undefined) {
          const trait = traitById.get(o.trait);
          if (!trait) errors.push({ file, path: `${oat}.trait`, message: `unknown trait "${o.trait}"` });
          else if (trait.category !== 'body') errors.push({ file, path: `${oat}.trait`, message: `"${o.trait}" is not a body trait` });
        }
        o.removes?.forEach((id, k) => {
          if (!traitById.has(id)) errors.push({ file, path: `${oat}.removes[${k}]`, message: `unknown trait "${id}"` });
        });
        if (o.condition !== undefined) {
          if (!conditionKinds.has(o.condition)) errors.push({ file, path: `${oat}.condition`, message: `unknown condition "${o.condition}"` });
          else if (o.condition === cond.id) errors.push({ file, path: `${oat}.condition`, message: 'a condition cannot follow itself' });
        }
        if (o.text) {
          const problem = checkTemplate(o.text);
          if (problem) errors.push({ file, path: `${oat}.text`, message: problem });
        }
      });
    });

    item.onsets.forEach((onset, i) => {
      const at = `health.onsets[${i}]`;
      if (!conditionKinds.has(onset.condition)) errors.push({ file, path: `${at}.condition`, message: `unknown condition "${onset.condition}"` });
      if (onset.text) {
        const problem = checkTemplate(onset.text);
        if (problem) errors.push({ file, path: `${at}.text`, message: problem });
      }
    });

    item.mortality.forEach((row, i) => {
      const at = `health.mortality[${i}]`;
      const last = i === item.mortality.length - 1;
      const prev = item.mortality[i - 1]?.below;
      if (last && row.below !== undefined) errors.push({ file, path: `${at}.below`, message: 'the last row has no age limit' });
      if (!last && row.below === undefined) errors.push({ file, path: `${at}.below`, message: 'every row but the last needs an age limit' });
      if (row.below !== undefined && prev !== undefined && row.below <= prev) {
        errors.push({ file, path: `${at}.below`, message: 'age limits must go up' });
      }
      if (!causeIds.has(row.cause)) errors.push({ file, path: `${at}.cause`, message: `unknown cause "${row.cause}"` });
    });

    for (const key of ['rest', 'road'] as const) {
      item[key].actions.forEach((id, i) => {
        if (!actionIds.has(id)) errors.push({ file, path: `health.${key}.actions[${i}]`, message: `unknown action "${id}"` });
      });
    }
    const problem = checkTemplate(item.texts.interrupted);
    if (problem) errors.push({ file, path: 'health.texts.interrupted', message: problem });
    for (const key of ['conditions_any', 'conditions_none'] as const) {
      const reason = checkReason(item.texts[key], ['conditions']);
      if (reason) errors.push({ file, path: `health.texts.${key}`, message: reason });
    }
    if (/[{}]/.test(item.texts.unfit)) {
      errors.push({ file, path: 'health.texts.unfit', message: 'this text is shown as is; placeholders are not allowed' });
    }
  }

  const checkRefs = (file: string, root: unknown, path: string) => {
    walkEffects(root, path, (effects, at) => {
      for (const key of ['wound', 'disease'] as const) {
        const id = effects[key];
        if (typeof id !== 'string') continue;
        const kind = conditionKinds.get(id);
        if (kind === undefined) errors.push({ file, path: `${at}.${key}`, message: `unknown condition "${id}"` });
        else if (kind !== key) errors.push({ file, path: `${at}.${key}`, message: `"${id}" is a ${kind}, not a ${key}` });
      }
      const heal = effects.heal;
      if (typeof heal === 'string' && heal !== 'all' && !conditionKinds.has(heal)) {
        errors.push({ file, path: `${at}.heal`, message: `unknown condition "${heal}"` });
      }
    });
  };
  for (const { file, index, item } of actions) checkRefs(file, item, `actions[${index}]`);
  for (const { file, index, item } of events) checkRefs(file, item, `events[${index}]`);

  // `kill` (3.5): the cause is known, and a hero dies only where D-164 allows. Actions always run for the hero.
  const causeIds = new Set(health.flatMap(({ item }) => item.causes.map((cause) => cause.id)));
  for (const { file, index, item } of actions) {
    const reported = new Set<string>();
    walkKeys(item, `actions[${index}]`, ['effects'], (effects, at) => {
      if (effects === null || typeof effects !== 'object') return;
      for (const kill of killsIn(effects as KillRefs, at)) {
        if (reported.has(kill.path)) continue;
        reported.add(kill.path);
        errors.push({ file, path: kill.path, message: 'kill is not allowed in an action' });
      }
    });
  }
  for (const { file, index, item } of events) checkKills(item, `events[${index}]`, causeIds, file, errors);

  // Conditions named in `when` / `where` of actions, events and grammar.
  const checkWhen = (file: string, root: unknown, path: string) => {
    walkKeys(root, path, ['when', 'where'], (when, at) => {
      if (when === null || typeof when !== 'object') return;
      for (const key of ['conditions_any', 'conditions_none'] as const) {
        const ids = (when as Record<string, unknown>)[key];
        if (!Array.isArray(ids)) continue;
        ids.forEach((id, i) => {
          if (typeof id === 'string' && !conditionKinds.has(id)) errors.push({ file, path: `${at}.${key}[${i}]`, message: `unknown condition "${id}"` });
        });
      }
    });
  };
  for (const { file, index, item } of actions) checkWhen(file, item, `actions[${index}]`);
  for (const { file, index, item } of events) checkWhen(file, item, `events[${index}]`);
  for (const { file, item } of grammar) checkWhen(file, item, 'grammar');
  return errors;
};
