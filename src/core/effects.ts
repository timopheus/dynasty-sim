/**
 * Assembly file (D-052): effect keys of all modules. A module declares its keys
 * (zod shape) and a function that applies them; this file merges the shapes into
 * the content schema and applies effects module by module in a fixed order.
 * Files that feed this one must not import it, directly or through other files.
 *
 * Effects apply to the character of their block and see the scope of roles
 * (D-162): a key that needs a second person names a role of the scope.
 */
import { z } from 'zod';
import { applyCharacterEffects, characterEffectShape } from './character/effects';
import { actionsEffectShape, applyActionsEffects } from './actions/effects';
import { applyBackstoryEffects, backstoryEffectShape } from './backstory/effects';
import { applyHealthEffects, healthEffectShape } from './health/health';
import { applyRelationsEffects, relationsEffectRoleRefs, relationsEffectShape } from './relations/effects';
import type { Character, Ctx, Scope } from './state';
import { applyStoriesEffects, storiesEffectRoleRefs, storiesEffectShape } from './stories/effects';
import { applyTimeEffects, timeEffectShape } from './time/effects';

export const EffectsSchema = z.strictObject({
  ...healthEffectShape,
  ...characterEffectShape,
  ...timeEffectShape(z.lazy((): z.ZodType => EffectsSchema)),
  ...actionsEffectShape,
  ...relationsEffectShape,
  ...storiesEffectShape,
  ...backstoryEffectShape,
});

export type Effects = z.infer<typeof EffectsSchema>;

const APPLY: readonly ((ctx: Ctx, c: Character, effects: Effects, scope: Scope) => void)[] = [
  applyHealthEffects,
  applyCharacterEffects,
  applyTimeEffects,
  applyActionsEffects,
  applyRelationsEffects,
  applyStoriesEffects,
  applyBackstoryEffects,
];

/** Roles each module's keys refer to, for the cross-check of events; `later` is followed in effectRoleRefs. */
const EFFECT_ROLE_REFS: readonly ((effects: Effects) => string[])[] = [relationsEffectRoleRefs, storiesEffectRoleRefs];

export function applyEffects(ctx: Ctx, c: Character, effects: Effects | undefined, scope: Scope): void {
  if (!effects) return;
  for (const apply of APPLY) apply(ctx, c, effects, scope);
}

/** Role names the effects refer to, nested `later` included; the built-in roles `hero` and `protagonist` too. */
export function effectRoleRefs(effects: Effects): string[] {
  return [...EFFECT_ROLE_REFS.flatMap((refs) => refs(effects)), ...(effects.later ?? []).flatMap((entry) => effectRoleRefs(entry.effects as Effects))];
}
