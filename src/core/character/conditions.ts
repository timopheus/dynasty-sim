import { z } from 'zod';
import type { Unmet } from '../condition-keys';
import { fillReason, joinOr } from '../conditions/reasons';
import { Id, Int } from '../content/types';
import type { Character, Ctx, Scope } from '../state';
import { SexSchema } from './content';
import { findTrait, hasTrait } from './holding';
import { STAT_IDS, type StatId } from './stat-ids';
import { stats } from './stats';

const StatRange = z
  .strictObject({ min: Int.optional(), max: Int.optional() })
  .refine((r) => r.min !== undefined || r.max !== undefined, { message: 'min or max is needed' })
  .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, { message: 'min is above max' });

type Sex = z.infer<typeof SexSchema>;
type StatRanges = Partial<Record<StatId, { min?: number | undefined; max?: number | undefined }>>;

/**
 * Condition keys of this module (D-054): `sex` limits an action or event to one sex; `traits_any` and `traits_none`
 * name traits, `stats` bounds the stats as they are today, `fame_min` is the lowest fame step (3.5).
 */
export const characterConditionShape = {
  sex: SexSchema.optional(),
  traits_any: z.array(Id).min(1).optional(),
  traits_none: z.array(Id).min(1).optional(),
  stats: z
    .strictObject(Object.fromEntries(STAT_IDS.map((id) => [id, StatRange.optional()])) as Record<StatId, z.ZodOptional<typeof StatRange>>)
    .refine((s) => Object.values(s).some((r) => r !== undefined), { message: 'name at least one stat' })
    .optional(),
  fame_min: Int.min(1).max(3).optional(),
};

interface CharacterWhen {
  sex?: Sex | undefined;
  traits_any?: string[] | undefined;
  traits_none?: string[] | undefined;
  stats?: StatRanges | undefined;
  fame_min?: number | undefined;
}

/**
 * Reasons are content texts (`names.requiresSex`, `names.reasons`). A reason that names a secret trait is hidden
 * (D-043): the option is not shown at all.
 */
export function checkCharacterConditions(ctx: Ctx, c: Character, when: CharacterWhen, _scope: Scope): Unmet[] {
  const { names } = ctx.content;
  const out: Unmet[] = [];
  const traitName = (id: string) => findTrait(ctx.content, id)?.name ?? id;
  const secret = (ids: string[]) => ids.some((id) => findTrait(ctx.content, id)?.visibility === 'secret');
  if (when.sex !== undefined && c.sex !== when.sex) out.push({ text: names.requiresSex[when.sex], hidden: false });
  if (when.traits_any && !when.traits_any.some((id) => hasTrait(c, id))) {
    out.push({ text: fillReason(names.reasons.traits_any, { traits: joinOr(when.traits_any.map(traitName)) }), hidden: secret(when.traits_any) });
  }
  const held = (when.traits_none ?? []).filter((id) => hasTrait(c, id));
  if (held.length > 0) out.push({ text: fillReason(names.reasons.traits_none, { traits: joinOr(held.map(traitName)) }), hidden: secret(held) });
  if (when.stats) {
    const have = stats(ctx, c);
    for (const id of STAT_IDS) {
      const range = when.stats[id];
      if (!range) continue;
      const vars = { stat: names.stats[id] };
      if (range.min !== undefined && have[id] < range.min) out.push({ text: fillReason(names.reasons.stat_min, { ...vars, value: String(range.min) }), hidden: false });
      if (range.max !== undefined && have[id] > range.max) out.push({ text: fillReason(names.reasons.stat_max, { ...vars, value: String(range.max) }), hidden: false });
    }
  }
  if (when.fame_min !== undefined && c.fame < when.fame_min) {
    out.push({ text: fillReason(names.reasons.fame_min, { fame: names.fame[when.fame_min] ?? '' }), hidden: false });
  }
  return out;
}
