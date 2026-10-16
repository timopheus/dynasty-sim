import type { Unmet } from '../condition-keys';
import { fillReason } from '../conditions/reasons';
import { Id, Int } from '../content/types';
import type { Character, Ctx, Scope } from '../state';
import { houseOf, renownWordFor, statusName, statusRank } from './house';

/**
 * Condition keys of this module (4.7, D-237, D-316), about the house of the character the condition is checked for; a
 * character with no house meets none of them:
 * - `house_status_min: <status id>` — the house has this status or a higher one (the order of `house.statuses`);
 * - `house_renown_min: N` — the renown of the house is N or more.
 * Neither names another person.
 */
export const houseConditionShape = {
  house_status_min: Id.optional(),
  house_renown_min: Int.optional(),
};

interface HouseWhen {
  house_status_min?: string | undefined;
  house_renown_min?: number | undefined;
}

export function checkHouseConditions(ctx: Ctx, c: Character, when: HouseWhen, _scope: Scope): Unmet[] {
  const { state, content } = ctx;
  const out: Unmet[] = [];
  const house = houseOf(state, c);
  const reasons = content.house?.reasons;
  if (!reasons) return when.house_status_min !== undefined || when.house_renown_min !== undefined ? [{ text: '', hidden: true }] : out;
  if (when.house_status_min !== undefined && (!house || statusRank(content, house.status) < statusRank(content, when.house_status_min))) {
    out.push({ text: fillReason(reasons.status_min, { status: statusName(content, when.house_status_min) }), hidden: false });
  }
  if (when.house_renown_min !== undefined && (!house || house.renown < when.house_renown_min)) {
    out.push({ text: fillReason(reasons.renown_min, { renown: renownWordFor(content, when.house_renown_min) }), hidden: false });
  }
  return out;
}

/** Roles the keys of this module refer to, for the cross-check of events: none. */
export function houseConditionRoleRefs(_when: object): string[] {
  return [];
}
