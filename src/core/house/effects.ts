import { z } from 'zod';
import { placeholderValues } from '../character/text';
import { Id, Int } from '../content/types';
import { log } from '../chronicle/log';
import { addSecret } from '../relations/secrets';
import type { Character, Ctx, Scope } from '../state';
import { fillTemplate } from '../text/text';
import { houseOf, statusName, statusRank } from './house';

/**
 * Effect keys of this module (4.7, D-237, D-316), applied to the house of the character of the block; a character with
 * no house is skipped (D-221):
 * - `house_status: {status, usurped?}` — the house takes the status (an id from `house.statuses`) and a line about it
 *   goes to the chronicle; `usurped: true` is a status taken without the right: the character carries the secret
 *   `usurped_status`, and the one who learns of it is the business of the events;
 * - `house_renown: N` — the renown of the house moves by N (not 0).
 * Neither names another person, so there are no role references. Like every file that feeds effects.ts, this one
 * must not import effects.ts (import cycle).
 */
export const houseEffectShape = {
  house_status: z.strictObject({ status: Id, usurped: z.boolean().optional() }).optional(),
  house_renown: Int.refine((n) => n !== 0, { message: 'a change of 0 does nothing' }).optional(),
};

interface HouseEffects {
  house_status?: { status: string; usurped?: boolean | undefined } | undefined;
  house_renown?: number | undefined;
}

/** Kind of the secret of a status taken without the right (through `relations/secrets`). */
export const USURPED_STATUS = 'usurped_status';

export function applyHouseEffects(ctx: Ctx, c: Character, effects: HouseEffects, _scope: Scope): void {
  const { state, content } = ctx;
  const house = houseOf(state, c);
  if (!house || !content.house) return;
  const set = effects.house_status;
  if (set && statusRank(content, set.status) >= 0 && house.status !== set.status) {
    house.status = set.status;
    const values = { ...placeholderValues(c, state.day), house: { id: house.id, name: house.name }, status: statusName(content, set.status) };
    log(ctx, { subject: c, kind: 'house_status', level: 'chronicle', parts: fillTemplate(content.house.texts.status, values) });
  }
  if (set?.usurped === true && !state.secrets.some((s) => s.about === c.id && s.kind === USURPED_STATUS)) addSecret(ctx, c.id, USURPED_STATUS, [c.id]);
  if (effects.house_renown !== undefined) house.renown += effects.house_renown;
}

/** Roles the keys of this module refer to, for the cross-check of events: none. */
export function houseEffectRoleRefs(_effects: object): string[] {
  return [];
}
