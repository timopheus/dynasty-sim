import { Id } from '../content/types';
import { findCharacter } from '../helpers';
import type { Character, Ctx, Scope } from '../state';
import { marry } from './marriage';

/**
 * Effect keys of this module (4.5): `marry: <role>` — the character marries the person of the role (`marriage.ts`).
 * The marriage refuses, and nothing changes, when the role is empty, either is dead, under age, married now, of the
 * same sex, or close kin (D-313, D-221). Like every file that feeds effects.ts, it must not import effects.ts.
 */
export const familyEffectShape = {
  marry: Id.optional(),
};

interface FamilyEffects {
  marry?: string | undefined;
}

export function applyFamilyEffects(ctx: Ctx, c: Character, effects: FamilyEffects, scope: Scope): void {
  if (effects.marry === undefined) return;
  const id = scope[effects.marry];
  const other = id === undefined ? null : findCharacter(ctx.state, id);
  if (other) marry(ctx, c, other);
}

/** Roles the keys of this module refer to, for the cross-check of events. */
export function familyEffectRoleRefs(effects: FamilyEffects): string[] {
  return effects.marry === undefined ? [] : [effects.marry];
}
