import type { Character, Ctx } from '../state';
import { ageYears } from '../time/calendar';
import { isCloseKin } from './kin';

/**
 * Who may marry whom (4.5, D-313): pure queries the conditions, the proposals and the marriage share. Kept apart from
 * marriage.ts, which calls the hooks: conditions must not reach hooks.ts.
 */

/** Why the two cannot marry now, as a short id, or null when they can. A pure query. */
export function marriageBar(ctx: Ctx, a: Character, b: Character): 'same' | 'dead' | 'young' | 'sex' | 'married' | 'kin' | null {
  const { state, content } = ctx;
  if (a.id === b.id) return 'same';
  if (a.deathDay !== null || b.deathDay !== null) return 'dead';
  const adult = content.settings.adultAge;
  if (ageYears(a.birthDay, state.day) < adult || ageYears(b.birthDay, state.day) < adult) return 'young';
  if (a.sex === b.sex) return 'sex';
  if (a.spouse !== null || b.spouse !== null) return 'married';
  if (isCloseKin(state, a.id, b.id)) return 'kin';
  return null;
}

export function canMarry(ctx: Ctx, a: Character, b: Character): boolean {
  return marriageBar(ctx, a, b) === null;
}

