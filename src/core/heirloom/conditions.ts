import type { Unmet } from '../condition-keys';
import { fillReason } from '../conditions/reasons';
import { Id, Int } from '../content/types';
import type { Character, Ctx, Scope } from '../state';
import { heldBy, kindName } from './heirloom';

/**
 * Condition keys of this module (4.9, D-238, D-380), about the things the character holds; neither names another
 * person:
 * - `has_heirloom: <kind>` — the character holds a thing of this kind;
 * - `heirloom_count_min: N` — the character holds N things or more.
 */
export const heirloomConditionShape = {
  has_heirloom: Id.optional(),
  heirloom_count_min: Int.min(1).optional(),
};

interface HeirloomWhen {
  has_heirloom?: string | undefined;
  heirloom_count_min?: number | undefined;
}

export function checkHeirloomConditions(ctx: Ctx, c: Character, when: HeirloomWhen, _scope: Scope): Unmet[] {
  const { state, content } = ctx;
  const out: Unmet[] = [];
  const reasons = content.heirlooms?.reasons;
  if (!reasons) return when.has_heirloom !== undefined || when.heirloom_count_min !== undefined ? [{ text: '', hidden: true }] : out;
  if (when.has_heirloom !== undefined && heldBy(state, c, when.has_heirloom).length === 0) {
    out.push({ text: fillReason(reasons.has, { kind: kindName(content, when.has_heirloom) }), hidden: false });
  }
  if (when.heirloom_count_min !== undefined && heldBy(state, c).length < when.heirloom_count_min) {
    out.push({ text: fillReason(reasons.count_min, { n: String(when.heirloom_count_min) }), hidden: false });
  }
  return out;
}

/** Roles the keys of this module refer to, for the cross-check of events: none. */
export function heirloomConditionRoleRefs(_when: object): string[] {
  return [];
}
