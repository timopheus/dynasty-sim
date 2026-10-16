import { z } from 'zod';
import type { Unmet } from '../condition-keys';
import type { Character, Ctx, Scope } from '../state';

/**
 * Condition keys of this module (D-360). None names another person, so no role refs (D-162, D-171).
 * - `will_command: true` — never met by the player's choice: the will action is started only by the `will` command
 *   (hidden: the action is not offered in the list).
 * - `will_stale: true | false` — the hero's will is out of date (a child born after it, a named person dead); false
 *   also when there is no will. For the notice and the events about an old will (4.13, 4.15). Hidden.
 */
export const successionConditionShape = {
  will_command: z.literal(true).optional(),
  will_stale: z.boolean().optional(),
};

interface SuccessionWhen {
  will_command?: true | undefined;
  will_stale?: boolean | undefined;
}

export function checkSuccessionConditions({ state }: Ctx, _c: Character, when: SuccessionWhen, _scope: Scope): Unmet[] {
  const unmet: Unmet[] = [];
  if (when.will_command) unmet.push({ text: '', hidden: true });
  if (when.will_stale !== undefined && (state.will?.stale ?? false) !== when.will_stale) unmet.push({ text: '', hidden: true });
  return unmet;
}

/** Roles the keys of this module refer to, for the cross-check of events: none. */
export function successionConditionRoleRefs(_when: object): string[] {
  return [];
}
