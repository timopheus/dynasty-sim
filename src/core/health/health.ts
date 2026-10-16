import { z } from 'zod';
import { log } from '../chronicle/log';
import { Id } from '../content/types';
import { isInt } from '../helpers';
import type { Unmet } from '../condition-keys';
import { fillReason, joinOr } from '../conditions/reasons';
import type { Character, CreateHook, Ctx, DeathHook, Invariant, RefsFn, Scope } from '../state';
import { addCondition, healStep, isSeverelyIll, stageOf, type HealthCondition } from './course';

/** A death ordered by an effect (`kill`, 3.5): the next death phase carries it out (D-164). */
export interface DeathRequest {
  characterId: string;
  /** Id of the cause, as in `health.causes`. */
  cause: string;
}

/** Health part of the game state. */
export interface HealthState {
  /** In the order they were made; emptied by the death phase. */
  deathRequests: DeathRequest[];
}

export function initHealthState(): HealthState {
  return { deathRequests: [] };
}

/** Health part of a character: conditions with stages instead of a scale (D-033). */
export interface HealthPart {
  /** In the order they began; at most one of each condition id. */
  conditions: HealthCondition[];
}

/** Characters start healthy. */
export const createHealth: CreateHook = (_ctx, c) => {
  c.conditions = [];
};

/** People the death requests refer to (D-312, D-164). */
export const healthRefs: RefsFn = ({ state }) => state.deathRequests.map((r) => r.characterId);

/** After the death line, the line of its cause, if the content has one (D-061). */
export const healthOnDeath: DeathHook = (ctx, c, cause) => {
  const text = ctx.content.health.causes.find((x) => x.id === cause)?.text;
  if (text) log(ctx, { subject: c, kind: 'death_cause', level: 'chronicle', template: text });
};

/** Effect keys of this module; effects.ts merges them into the content schema. */
export const healthEffectShape = {
  /** Gives a wound condition at its first stage (nothing if the character already has it). */
  wound: Id.optional(),
  /** Gives a disease condition at its first stage (nothing if the character already has it). */
  disease: Id.optional(),
  /** One stage back for the condition, or for all of them; recovery from the first stage. */
  heal: Id.optional(),
  /** Death of the character by the cause (an id of `health.causes`): a request the death phase carries out (D-164, 3.5). */
  kill: Id.optional(),
};

interface HealthEffects {
  wound?: string | undefined;
  disease?: string | undefined;
  heal?: string | undefined;
  kill?: string | undefined;
}

/** Order: heal, then new wounds and diseases, so `heal: all` with a new wound keeps the wound. */
export function applyHealthEffects(ctx: Ctx, c: Character, effects: HealthEffects, _scope: Scope): void {
  if (effects.heal !== undefined) {
    for (const hc of [...c.conditions]) {
      if (effects.heal === 'all' || effects.heal === hc.id) healStep(ctx, c, hc);
    }
  }
  if (effects.wound !== undefined) addCondition(ctx, c, effects.wound);
  if (effects.disease !== undefined) addCondition(ctx, c, effects.disease);
  if (effects.kill !== undefined && c.deathDay === null) ctx.state.deathRequests.push({ characterId: c.id, cause: effects.kill });
}

/**
 * Condition keys of this module (D-054): `fit: true` needs no condition at a severe stage; `conditions_any` and
 * `conditions_none` name conditions of `health.conditions` the character has or has not (3.5).
 */
export const healthConditionShape = {
  fit: z.literal(true).optional(),
  conditions_any: z.array(Id).min(1).optional(),
  conditions_none: z.array(Id).min(1).optional(),
};

interface HealthWhen {
  fit?: true | undefined;
  conditions_any?: string[] | undefined;
  conditions_none?: string[] | undefined;
}

export function checkHealthConditions({ content }: Ctx, c: Character, when: HealthWhen, _scope: Scope): Unmet[] {
  const { texts, conditions } = content.health;
  const out: Unmet[] = [];
  const name = (id: string) => conditions.find((d) => d.id === id)?.name ?? id;
  const has = (id: string) => c.conditions.some((hc) => hc.id === id);
  if (when.fit && isSeverelyIll(content, c)) out.push({ text: texts.unfit, hidden: false });
  if (when.conditions_any && !when.conditions_any.some(has)) {
    out.push({ text: fillReason(texts.conditions_any, { conditions: joinOr(when.conditions_any.map(name)) }), hidden: false });
  }
  const held = (when.conditions_none ?? []).filter(has);
  if (held.length > 0) out.push({ text: fillReason(texts.conditions_none, { conditions: joinOr(held.map(name)) }), hidden: false });
  return out;
}

/** Stage penalties of all conditions, summed (D-080: stats.ts adds them). */
export function healthStatModifiers({ content }: Ctx, c: Character): Record<string, number> {
  const out: Record<string, number> = {};
  for (const hc of c.conditions) {
    for (const [stat, value] of Object.entries(stageOf(content, hc).penalties ?? {})) {
      if (value !== undefined) out[stat] = (out[stat] ?? 0) + value;
    }
  }
  return out;
}

export const healthInvariants: Invariant = ({ state, content }) => {
  const problems: string[] = [];
  for (const r of state.deathRequests) {
    if (!state.characters.some((c) => c.id === r.characterId)) problems.push(`death requested for unknown character ${r.characterId}`);
  }
  for (const c of state.characters) {
    if (!Array.isArray(c.conditions)) {
      problems.push(`${c.id} has no list of conditions`);
      continue;
    }
    const seen = new Set<string>();
    for (const hc of c.conditions) {
      if (seen.has(hc.id)) problems.push(`${c.id} has condition ${hc.id} twice`);
      seen.add(hc.id);
      const def = content.health.conditions.find((d) => d.id === hc.id);
      if (!def) {
        problems.push(`${c.id} has unknown condition ${hc.id}`);
        continue;
      }
      if (!def.stages.some((s) => s.id === hc.stage)) problems.push(`${c.id} condition ${hc.id} has unknown stage ${hc.stage}`);
      const end = c.deathDay ?? state.day;
      if (!isInt(hc.start) || !isInt(hc.since) || hc.start > hc.since || hc.since > end || hc.start < c.birthDay) {
        problems.push(`${c.id} condition ${hc.id} has invalid days ${hc.start}..${hc.since}`);
      }
    }
  }
  return problems;
};
