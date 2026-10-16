import { z } from 'zod';
import { fullName } from '../character/character';
import type { Unmet } from '../condition-keys';
import { fillReason } from '../conditions/reasons';
import { Id, Int } from '../content/types';
import { findCharacter } from '../helpers';
import type { Character, Ctx, Scope } from '../state';
import { KIN_KINDS, type KinKind } from './content';
import { isKin } from './kin';
import { canMarry } from './rules';

/**
 * Condition keys of this module (4.5):
 * - `married: true | false` — the character has a living spouse now;
 * - `kin: {kind, with}` — the character is the `kind` (spouse, child, parent, sibling) of the role `with`;
 * - `children_min: n` — the character has at least n living children;
 * - `can_marry: <role>` — the character and the role may marry now (`marriage.ts`).
 * A key naming an empty optional role is never met, and its reason is hidden (D-221). Must not import
 * condition-keys.ts at run time.
 */
export const familyConditionShape = {
  married: z.boolean().optional(),
  kin: z.strictObject({ kind: z.enum(KIN_KINDS), with: Id }).optional(),
  children_min: Int.min(1).optional(),
  can_marry: Id.optional(),
};

interface FamilyWhen {
  married?: boolean | undefined;
  kin?: { kind: KinKind; with: string } | undefined;
  children_min?: number | undefined;
  can_marry?: string | undefined;
}

const NEVER: Unmet = { text: '', hidden: true };

/** Living children of the person. */
export function livingChildren(ctx: Ctx, id: string): number {
  return ctx.state.characters.filter((c) => (c.father === id || c.mother === id) && c.deathDay === null).length;
}

export function checkFamilyConditions(ctx: Ctx, c: Character, when: FamilyWhen, scope: Scope): Unmet[] {
  const { state, content } = ctx;
  if (when.married === undefined && when.kin === undefined && when.children_min === undefined && when.can_marry === undefined) return [];
  const texts = content.family?.texts;
  if (!texts) throw new Error('The conditions "married", "kin", "children_min" and "can_marry" need the family section');
  const unmet: Unmet[] = [];
  const nameOf = (id: string) => {
    const other = findCharacter(state, id);
    return other ? fullName(other) : id;
  };
  if (when.married !== undefined && (c.spouse !== null) !== when.married) {
    unmet.push({ text: when.married ? texts.reasons.married : texts.reasons.unmarried, hidden: false });
  }
  if (when.kin) {
    const other = scope[when.kin.with];
    if (other === undefined) unmet.push(NEVER);
    else if (!isKin(state, when.kin.kind, c.id, other)) {
      unmet.push({ text: fillReason(texts.reasons.kin, { kind: texts.kinds[when.kin.kind], name: nameOf(other) }), hidden: false });
    }
  }
  if (when.children_min !== undefined && livingChildren(ctx, c.id) < when.children_min) {
    unmet.push({ text: fillReason(texts.reasons.childrenMin, { count: String(when.children_min) }), hidden: false });
  }
  if (when.can_marry !== undefined) {
    const id = scope[when.can_marry];
    const other = id === undefined ? null : findCharacter(state, id);
    if (!other) unmet.push(NEVER);
    else if (!canMarry(ctx, c, other)) unmet.push({ text: fillReason(texts.reasons.canMarry, { name: fullName(other) }), hidden: false });
  }
  return unmet;
}

/** Roles the keys of this module refer to, for the cross-check of events. */
export function familyConditionRoleRefs(when: FamilyWhen): string[] {
  return [...(when.kin ? [when.kin.with] : []), ...(when.can_marry !== undefined ? [when.can_marry] : [])];
}
