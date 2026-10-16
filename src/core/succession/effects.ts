import { z } from 'zod';
import { placeholderValues } from '../character/text';
import { fullName } from '../character/character';
import { log } from '../chronicle/log';
import { findCharacter } from '../helpers';
import type { Character, Ctx, Scope } from '../state';
import { fillTemplate } from '../text/text';
import { canGuard, willHeirs } from './law';

/**
 * Effect keys of this module (D-360). None names another person, so no role refs (D-162, D-171).
 * - `will_signed: true` — on the will action only (checkSuccession): the terms of the `will` command become the will
 *   of the hero, the notary is paid (`succession.willCost`), a journal line. Without terms waiting it does nothing.
 */
export const successionEffectShape = {
  will_signed: z.literal(true).optional(),
};

interface SuccessionEffects {
  will_signed?: true | undefined;
}

export function applySuccessionEffects(ctx: Ctx, c: Character, effects: SuccessionEffects, _scope: Scope): void {
  if (effects.will_signed) signWill(ctx, c);
}

/** The end of the notary action: what still holds of the terms becomes the will (D-314, D-360). */
function signWill(ctx: Ctx, hero: Character): void {
  const { state, content } = ctx;
  const draft = state.willDraft;
  const pace = content.succession;
  if (!draft || !pace || hero.id !== state.playerId) return;
  state.willDraft = null;
  // People may have died during the days at the notary: a dead heir or guardian is an empty term, filled by the law.
  const heir = draft.heir !== null && willHeirs(state, hero.id).some((k) => k.id === draft.heir) ? draft.heir : null;
  const guardian = draft.guardian !== null && canGuard(ctx, findCharacter(state, draft.guardian), hero, null) ? draft.guardian : null;
  const items = draft.items.filter((i) => findCharacter(state, i.to)?.deathDay === null);
  hero.money -= pace.willCost;
  state.will = { day: state.day, heir, guardian, items, stale: false };
  const named = heir === null ? null : findCharacter(state, heir);
  const parts = named
    ? fillTemplate(pace.texts.willSigned, { ...placeholderValues(hero, state.day), heir: { id: named.id, name: fullName(named) } })
    : fillTemplate(pace.texts.willSignedNoHeir, placeholderValues(hero, state.day));
  log(ctx, { subject: hero, kind: 'will', level: 'journal', parts });
}

/** Roles the keys of this module refer to, for the cross-check of events: none. */
export function successionEffectRoleRefs(_effects: object): string[] {
  return [];
}
