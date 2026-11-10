import { z } from 'zod';
import { checkReason } from '../conditions/reasons';
import { conditionRoleRefs, WhenSchema } from '../condition-keys';
import type { CrossCheck } from '../content/schema';
import { Id, Int, Text, type ContentError } from '../content/types';
import { effectRoleRefs, EffectsSchema } from '../effects';

/** Roles an interaction knows: the hero (also the main participant) and the person it is aimed at. */
export const INTERACTION_ROLES = ['hero', 'protagonist', 'target'] as const;

/**
 * One interaction with a person (CK.2a; the menu of a person in CK3, D-448): CK.7 adds the consent as a sum of reasons
 * shown in its window (D-474), its price, its answer.
 */
export const InteractionSchema = z.strictObject({
  id: Id,
  name: Text,
  /** Conditions on the hero; the person aimed at is the role `target` (D-043: unmet ones are shown as reasons). */
  when: WhenSchema.optional(),
  /** Effects on the hero; the person aimed at is the role `target`. */
  effects: EffectsSchema.optional(),
  /** Effects on the person aimed at, as `on` of an event; the hero is the role `hero`. */
  on: z.strictObject({ target: EffectsSchema }).optional(),
  /** Days before the hero may do it again to the same person. */
  cooldown_days: Int.min(1).optional(),
});

/**
 * Optional top-level key `interactions` (CK.2a):
 * - `list`: the interactions, in the order of the menu;
 * - `reasons`: texts of unmet conditions — `cooldown` (done to this person lately).
 */
export const InteractionsContentSchema = z.strictObject({
  list: z.array(InteractionSchema).min(1),
  reasons: z.strictObject({ cooldown: Text }),
});

export type InteractionDef = z.infer<typeof InteractionSchema>;
export type InteractionsContent = z.infer<typeof InteractionsContentSchema>;

/** Ids are unique; conditions and effects name only the roles of an interaction. */
export const checkInteractions: CrossCheck = ({ interactions }) => {
  const errors: ContentError[] = [];
  for (const { file, item } of interactions) {
    const err = (path: string, message: string) => errors.push({ file, path: `interactions.${path}`, message });
    const ids = new Set<string>();
    item.list.forEach((x, i) => {
      if (ids.has(x.id)) err(`list[${i}].id`, `duplicate interaction "${x.id}"`);
      ids.add(x.id);
      const blocks = [x.effects, x.on?.target].filter((e) => e !== undefined);
      const roles = [...(x.when ? conditionRoleRefs(x.when) : []), ...blocks.flatMap((e) => effectRoleRefs(e))];
      for (const role of roles) {
        if (!(INTERACTION_ROLES as readonly string[]).includes(role)) err(`list[${i}]`, `unknown role "${role}": an interaction knows ${INTERACTION_ROLES.join(', ')}`);
      }
    });
    const problem = checkReason(item.reasons.cooldown, []);
    if (problem) err('reasons.cooldown', problem);
  }
  return errors;
};
