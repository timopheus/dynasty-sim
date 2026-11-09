import { z } from 'zod';
import { fullName } from '../character/character';
import type { Unmet } from '../condition-keys';
import { fillReason } from '../conditions/reasons';
import { Id } from '../content/types';
import { findCharacter } from '../helpers';
import type { Character, Ctx, Scope } from '../state';
import { favorBetween, usable } from './favors';

/**
 * Condition key of this module (CK.2a): `favor_with: <role>` — the character may call in a favor the person of the role
 * owes them now (a weak one within its term, a strong one not resting); `favor_with: {role, strength: strong}` — a strong
 * one. The reason is visible (`favors.reasons`): one knows who owes one. A key naming an empty optional role is never met,
 * and its reason is hidden (D-221). Must not import condition-keys.ts at run time.
 */
const FavorWith = z.union([Id, z.strictObject({ role: Id, strength: z.enum(['weak', 'strong']).optional() })]);

export const favorsConditionShape = {
  favor_with: FavorWith.optional(),
};

interface FavorsWhen {
  favor_with?: string | { role: string; strength?: 'weak' | 'strong' | undefined } | undefined;
}

export function checkFavorsConditions(ctx: Ctx, c: Character, when: FavorsWhen, scope: Scope): Unmet[] {
  if (when.favor_with === undefined) return [];
  const { state, content } = ctx;
  const favors = content.favors;
  if (!favors) throw new Error('The condition "favor_with" needs the favors section');
  const role = typeof when.favor_with === 'string' ? when.favor_with : when.favor_with.role;
  const strong = typeof when.favor_with === 'object' && when.favor_with.strength === 'strong';
  const other = scope[role];
  if (other === undefined || other === c.id) return [{ text: '', hidden: true }];
  const f = favorBetween(state, other, c.id);
  if (f && usable(state, content, f) && (!strong || f.strength === 'strong')) return [];
  const person = findCharacter(state, other);
  return [{ text: fillReason(strong ? favors.reasons.strong : favors.reasons.none, { name: person ? fullName(person) : other }), hidden: false }];
}

/** The role the condition names, for the cross-check of events. */
export function favorsConditionRoleRefs(when: FavorsWhen): string[] {
  if (when.favor_with === undefined) return [];
  return [typeof when.favor_with === 'string' ? when.favor_with : when.favor_with.role];
}
