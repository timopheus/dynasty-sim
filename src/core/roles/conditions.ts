import { z } from 'zod';
import type { Unmet } from '../condition-keys';
import { fillReason, joinOr } from '../conditions/reasons';
import { Id, Int } from '../content/types';
import type { Character, Ctx, Scope } from '../state';
import { ageYears } from '../time/calendar';

/**
 * Condition keys of this module (3.3): `occupation: [ids]` — the character's occupation is one of them. The reason
 * text is `population.occupationReason`. `age_near: n` (D-479) — the person is at most n full years older or younger
 * than the hero (`scope.hero`): a hidden reason, the role simply finds nobody else. Must not import condition-keys.ts at run time.
 */
export const rolesConditionShape = {
  occupation: z.array(Id).min(1).optional(),
  age_near: Int.min(0).optional(),
};

interface RolesWhen {
  occupation?: string[] | undefined;
  age_near?: number | undefined;
}

export function checkRolesConditions(ctx: Ctx, c: Character, when: RolesWhen, scope: Scope): Unmet[] {
  const unmet: Unmet[] = [];
  const { content, state } = ctx;
  if (when.occupation !== undefined && !(c.occupation !== null && when.occupation.includes(c.occupation))) {
    const population = content.population;
    if (!population) throw new Error('The condition "occupation" needs the population section');
    const names = when.occupation.map((id) => population.occupations.find((o) => o.id === id)?.name ?? id);
    unmet.push({ text: fillReason(population.occupationReason, { occupations: joinOr(names, content) }), hidden: false });
  }
  if (when.age_near !== undefined) {
    const hero = state.characters.find((h) => h.id === (scope.hero ?? state.playerId));
    if (hero && Math.abs(ageYears(c.birthDay, state.day) - ageYears(hero.birthDay, state.day)) > when.age_near) {
      unmet.push({ text: `Not within ${when.age_near} years of the hero's age`, hidden: true });
    }
  }
  return unmet;
}
