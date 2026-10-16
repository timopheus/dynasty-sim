import { z } from 'zod';
import { Id, Int } from '../content/types';
import type { Character, Ctx, Scope } from '../state';
import { BASE_STAT_MAX, STAT_IDS, type StatId } from './stat-ids';
import { addTrait, removeTrait } from './traits';

/** Fame is a step 0..3 (D-037). */
export const FAME_MAX = 3;

const StatSteps = z.strictObject(Object.fromEntries(STAT_IDS.map((id) => [id, Int.optional()])) as Record<StatId, z.ZodOptional<z.ZodInt>>);

/** Effect keys of this module; effects.ts merges them into the content schema. */
export const characterEffectShape = {
  money: z.int().optional(),
  /** Takes traits away, then gives traits; a new trait removes its opposite (D-032). */
  traits: z
    .strictObject({ add: z.array(Id).min(1).optional(), remove: z.array(Id).min(1).optional() })
    .refine((t) => t.add !== undefined || t.remove !== undefined, { message: 'add or remove is needed' })
    .optional(),
  /** Change to the base of stats (experience, backstory), kept within 0..BASE_STAT_MAX. */
  stats: StatSteps.refine((s) => Object.values(s).some((v) => v !== undefined && v !== 0), { message: 'name at least one stat with a change' }).optional(),
  /** Steps of fame to add or take away, -3..3; the result stays within 0..3. */
  fame: Int.min(-FAME_MAX).max(FAME_MAX).refine((n) => n !== 0, { message: 'a change of 0 does nothing' }).optional(),
};

export function applyCharacterEffects(
  ctx: Ctx,
  c: Character,
  effects: {
    money?: number | undefined;
    traits?: { add?: string[] | undefined; remove?: string[] | undefined } | undefined;
    stats?: Partial<Record<StatId, number | undefined>> | undefined;
    fame?: number | undefined;
  },
  _scope: Scope,
): void {
  if (effects.money !== undefined) c.money += effects.money;
  for (const id of effects.traits?.remove ?? []) removeTrait(ctx, c, id);
  for (const id of effects.traits?.add ?? []) addTrait(ctx, c, id);
  for (const id of STAT_IDS) {
    const step = effects.stats?.[id];
    if (step !== undefined) c.baseStats[id] = Math.min(BASE_STAT_MAX, Math.max(0, c.baseStats[id] + step));
  }
  if (effects.fame !== undefined) c.fame = Math.min(FAME_MAX, Math.max(0, c.fame + effects.fame));
}
