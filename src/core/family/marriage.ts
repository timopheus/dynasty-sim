import { afterMarriage } from '../hooks';
import type { Character, Ctx } from '../state';
import { logAboutHero, type Marriage } from './family';
import { syncHousehold } from './household';
import { canMarry } from './rules';

export { canMarry, marriageBar } from './rules';

/**
 * Marriage (4.5, D-313). Customs of 1700: a man and a woman, both of age (`adultAge`), neither married now, not close
 * kin (ancestor and descendant, brothers and sisters, half ones too, uncle or aunt and nephew or niece; cousins may).
 * A death ends a marriage (`familyOnDeath`); the widowed may marry again. Names do not change at marriage: the
 * surname of a child is its father's, of a heroine-head's child hers (D-313); the rules of states are stage 5.
 * Never imports lifecycle.ts, events/ or effects.ts: the effect `marry` calls it.
 */

/**
 * Marries the two, if they can: the record, the hero's household, the chronicle line when the hero marries, then the
 * marriage hooks (the house of the spouse, 4.7). Returns the marriage, or null and nothing changed (D-221: a refusal
 * is not an error).
 */
export function marry(ctx: Ctx, a: Character, b: Character): Marriage | null {
  if (!canMarry(ctx, a, b)) return null;
  const { state, content } = ctx;
  const hero = state.playerId;
  const heroMarries = a.id === hero || b.id === hero;
  const marriage = recordMarriage(ctx, a, b, state.day, () => {
    if (!heroMarries) return;
    syncHousehold(ctx);
    const texts = content.family?.texts;
    if (texts) logAboutHero(ctx, 'marriage', texts.married, { other: a.id === hero ? b : a });
  });
  return marriage;
}

/**
 * Writes the marriage record and runs the marriage hooks; `before` runs between the two. The pedigree (D-313) uses it
 * for marriages made long ago, `start` in the past; it checks nothing.
 */
export function recordMarriage(ctx: Ctx, a: Character, b: Character, start: number, before: () => void = () => {}): Marriage {
  const marriage: Marriage = { a: a.id, b: b.id, start, end: null, endReason: null };
  ctx.state.marriages.push(marriage);
  a.spouse = b.id;
  b.spouse = a.id;
  before();
  afterMarriage(ctx, marriage);
  return marriage;
}
