import { z } from 'zod';
import { log } from '../chronicle/log';
import { Id } from '../content/types';
import { isInt } from '../helpers';
import type { Character, CreateHook, Ctx, DeathHook, Invariant } from '../state';
import { addCondition, healStep, isSeverelyIll, stageOf, type HealthCondition } from './course';

/** Health part of a character: conditions with stages instead of a scale (D-033). */
export interface HealthPart {
  /** In the order they began; at most one of each condition id. */
  conditions: HealthCondition[];
}

/** Characters start healthy. */
export const createHealth: CreateHook = (_ctx, c) => {
  c.conditions = [];
};

/** After the death line, the line of its cause, if the content has one (D-061). */
export const healthOnDeath: DeathHook = ({ state, content }, c, cause) => {
  const text = content.health.causes.find((x) => x.id === cause)?.text;
  if (text) log(state, { subject: c, kind: 'death_cause', level: 'chronicle', template: text });
};

/** Effect keys of this module; effects.ts merges them into the content schema. */
export const healthEffectShape = {
  /** Gives a wound condition at its first stage (nothing if the character already has it). */
  wound: Id.optional(),
  /** Gives a disease condition at its first stage (nothing if the character already has it). */
  disease: Id.optional(),
  /** One stage back for the condition, or for all of them; recovery from the first stage. */
  heal: Id.optional(),
};

interface HealthEffects {
  wound?: string | undefined;
  disease?: string | undefined;
  heal?: string | undefined;
}

/** Order: heal, then new wounds and diseases, so `heal: all` with a new wound keeps the wound. */
export function applyHealthEffects(ctx: Ctx, c: Character, effects: HealthEffects): void {
  if (effects.heal !== undefined) {
    for (const hc of [...c.conditions]) {
      if (effects.heal === 'all' || effects.heal === hc.id) healStep(ctx, c, hc);
    }
  }
  if (effects.wound !== undefined) addCondition(ctx, c, effects.wound);
  if (effects.disease !== undefined) addCondition(ctx, c, effects.disease);
}

/** Condition keys of this module (D-054): `fit: true` needs no condition at a severe stage. */
export const healthConditionShape = {
  fit: z.literal(true).optional(),
};

export function checkHealthConditions({ content }: Ctx, c: Character, when: { fit?: true | undefined }): string[] {
  if (when.fit && isSeverelyIll(content, c)) return [content.health.texts.unfit];
  return [];
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
