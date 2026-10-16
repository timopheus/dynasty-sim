import { z } from 'zod';
import type { Unmet } from '../condition-keys';
import { fillReason, joinOr } from '../conditions/reasons';
import { Id } from '../content/types';
import type { Character, Ctx, Scope } from '../state';

/**
 * Condition keys of this module (3.3): `occupation: [ids]` — the character's occupation is one of them. The reason
 * text is `population.occupationReason`. Must not import condition-keys.ts at run time.
 */
export const rolesConditionShape = {
  occupation: z.array(Id).min(1).optional(),
};

interface RolesWhen {
  occupation?: string[] | undefined;
}

export function checkRolesConditions({ content }: Ctx, c: Character, when: RolesWhen, _scope: Scope): Unmet[] {
  if (when.occupation === undefined || (c.occupation !== null && when.occupation.includes(c.occupation))) return [];
  const population = content.population;
  if (!population) throw new Error('The condition "occupation" needs the population section');
  const names = when.occupation.map((id) => population.occupations.find((o) => o.id === id)?.name ?? id);
  return [{ text: fillReason(population.occupationReason, { occupations: joinOr(names) }), hidden: false }];
}
