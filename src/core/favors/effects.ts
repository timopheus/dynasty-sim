import { z } from 'zod';
import { Id } from '../content/types';
import type { Character, Ctx, Scope } from '../state';
import { grantFavor, useFavor } from './favors';

/**
 * Effect keys of this module (CK.2a), applied to the character of the block; the other person is a role of the scope:
 * - `favor: {from: <role>, strength: weak | strong}` — the person of the role now owes the character a favor;
 * - `favor_use: <role>` — the character calls in the favor the person of the role owes: a weak one is spent, a strong one
 *   rests (nothing happens if none can be called in).
 * An effect that names an empty optional role or the character themself is skipped (D-221). Like every file that feeds
 * effects.ts, it must not import effects.ts (import cycle).
 */
export const favorsEffectShape = {
  favor: z.strictObject({ from: Id, strength: z.enum(['weak', 'strong']) }).optional(),
  favor_use: Id.optional(),
};

interface FavorsEffects {
  favor?: { from: string; strength: 'weak' | 'strong' } | undefined;
  favor_use?: string | undefined;
}

export function applyFavorsEffects(ctx: Ctx, c: Character, effects: FavorsEffects, scope: Scope): void {
  const { state, content } = ctx;
  if (effects.favor) {
    const from = scope[effects.favor.from];
    if (from !== undefined) grantFavor(state, content, from, c.id, effects.favor.strength);
  }
  if (effects.favor_use !== undefined) {
    const from = scope[effects.favor_use];
    if (from !== undefined) useFavor(state, content, from, c.id);
  }
}

/** Roles the effects name, for the cross-check of events. */
export function favorsEffectRoleRefs(effects: FavorsEffects): string[] {
  return [effects.favor?.from, effects.favor_use].filter((r): r is string => r !== undefined);
}
